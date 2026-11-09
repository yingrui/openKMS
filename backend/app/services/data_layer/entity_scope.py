"""Entity-level row scope for a Catalog data resource.

A resource's row conditions describe **which entities** a caller may see, not which physical
table they live on. The distinction matters because a semantic model is a set of datasets
joined on shared keys, and a metric's `FROM` is only one of them: a condition written against
`stock_basic.industry` must still constrain a query whose base table is `daily_basic`.

Ossie already models this — `datasets[].primary_key` names entities and `relationships`
(from-many -> to-one foreign keys) declares the paths between them — so the compiler walks
that graph instead of inventing a "base table" concept.

One condition compiles to either:

- a plain predicate on the base alias, when the base dataset owns the column; or
- `EXISTS (SELECT 1 FROM <chain to owner> WHERE <correlation to base> AND <condition>)`.

Every unresolved case is **refused**, never guessed:

| Situation | Code |
|---|---|
| Column on several datasets, unqualified | `ROW_POLICY_AMBIGUOUS_COLUMN` |
| Column on no dataset of the model | `ROW_POLICY_UNKNOWN_COLUMN` |
| Owner unreachable, or reachable by more than one path | `ROW_POLICY_NO_PATH` |

Two paths can yield different row sets, so picking one would silently change who sees what.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.semantic_model_dataset import SemanticModelDataset
from app.services.data_layer.columns import ColumnError, cached_column_names
from app.services.data_layer.query_errors import REQUEST, QueryFailure
from app.services.data_layer.row_policy import (
    _claim_value,
    policy_conditions,
    validate_policy,
)
from app.services.ontology.dataset_tables import is_valid_identifier

QUALIFIER_SEP = "."


class EntityScopeError(ValueError):
    """A row scope that cannot be compiled to exactly one predicate; refuses the query."""

    def __init__(self, message: str, failure: QueryFailure | None = None) -> None:
        super().__init__(message)
        self.failure = failure or QueryFailure("ROW_POLICY_INVALID", REQUEST)


def _quote(ident: str) -> str:
    return '"' + str(ident).replace('"', '""') + '"'


def _qualified(dataset: Dataset) -> str:
    return f"{_quote(dataset.schema_name)}.{_quote(dataset.table_name)}"


def _split_column(column: str) -> tuple[str | None, str]:
    """`"orders.region"` -> `("orders", "region")`; bare `"region"` -> `(None, "region")`."""
    if QUALIFIER_SEP not in column:
        return None, column
    head, _, tail = column.rpartition(QUALIFIER_SEP)
    return head, tail


@dataclass(frozen=True)
class ModelGraph:
    """Dataset membership and the relationship edges of one semantic model."""

    dataset_ids: frozenset[str]
    datasets: dict[str, Dataset]
    #: dataset id -> label, used in messages and as a column qualifier.
    labels: dict[str, str]
    joins: dict[str, DatasetJoin] = field(default_factory=dict)
    #: unordered dataset pair -> relationship ids declared between them.
    edges: dict[frozenset[str], list[str]] = field(default_factory=dict)

    @classmethod
    def build(
        cls,
        dataset_ids: list[str],
        datasets: dict[str, Dataset],
        joins: list[DatasetJoin],
    ) -> ModelGraph:
        member = frozenset(dataset_ids)
        edges: dict[frozenset[str], list[str]] = {}
        by_id: dict[str, DatasetJoin] = {}
        for join in joins:
            if (
                join.from_dataset_id in member
                and join.to_dataset_id in member
                and join.from_dataset_id != join.to_dataset_id
            ):
                edges.setdefault(
                    frozenset((join.from_dataset_id, join.to_dataset_id)), []
                ).append(join.id)
                by_id[join.id] = join
        labels = {
            dataset_id: (
                (datasets[dataset_id].display_name or datasets[dataset_id].table_name or dataset_id)
                if dataset_id in datasets
                else dataset_id
            )
            for dataset_id in member
        }
        return cls(
            dataset_ids=member,
            datasets=datasets,
            labels=labels,
            joins=by_id,
            edges=edges,
        )

    def datasets_matching(self, qualifier: str) -> list[str]:
        """Datasets a column qualifier may denote: its id, table name, or display label.

        The table name is the form people actually type (`stock_basic.industry`), so it is
        accepted alongside the id and the label rather than forcing a lookup.
        """
        out: list[str] = []
        for dataset_id in self.dataset_ids:
            dataset = self.datasets.get(dataset_id)
            candidates = {dataset_id, self.labels.get(dataset_id, "")}
            if dataset is not None:
                candidates.add(dataset.table_name or "")
                candidates.add(dataset.display_name or "")
            if qualifier in candidates:
                out.append(dataset_id)
        return out

    def path_between(self, start: str, target: str) -> tuple[str, ...] | None:
        """Relationship ids from `start` to `target`; None when unreachable or ambiguous.

        Breadth-first over the shortest distance. Two relationships between the same pair of
        datasets count as ambiguous: that pair can represent a current and a historical join,
        and choosing either would change the row set.
        """
        if start == target:
            return ()
        if len(self.edges.get(frozenset((start, target)), [])) > 1:
            return None

        paths: dict[str, list[tuple[str, ...]]] = {start: [()]}
        frontier: list[tuple[str, tuple[str, ...]]] = [(start, ())]
        settled: set[str] = {start}
        while frontier:
            nxt: list[tuple[str, tuple[str, ...]]] = []
            for node, path in frontier:
                for edge, ids in self.edges.items():
                    if node not in edge:
                        continue
                    other = next(iter(edge - {node}), None)
                    if other is None or other in settled:
                        continue
                    for join_id in ids:
                        candidate = (*path, join_id)
                        paths.setdefault(other, []).append(candidate)
                        nxt.append((other, candidate))
            if any(node == target for node, _ in nxt):
                break
            settled.update(node for node, _ in nxt)
            frontier = nxt

        found = paths.get(target) or []
        return found[0] if len(found) == 1 else None


async def load_model_graph(db: AsyncSession, model_id: str) -> ModelGraph:
    """Membership, datasets and relationships for one model."""
    # One round trip for membership **and** the datasets: the ids were fetched first only to be used as an `IN`, which
    # is a second round trip that returns rows the join already has. The source is joined in for the same reason —
    # `load_columns` needs it per dataset, and a lazy load there is a `MissingGreenlet`, not a slow query.
    datasets = {
        d.id: d
        for d in (
            await db.execute(
                select(Dataset)
                .join(SemanticModelDataset, SemanticModelDataset.dataset_id == Dataset.id)
                .where(SemanticModelDataset.semantic_model_id == model_id)
                .options(joinedload(Dataset.data_source_rel))
            )
        ).scalars()
    }
    member_ids = list(datasets)
    if not member_ids:
        return ModelGraph(dataset_ids=frozenset(), datasets={}, labels={})
    joins = list(
        (
            await db.execute(
                select(DatasetJoin).where(
                    DatasetJoin.from_dataset_id.in_(member_ids),
                    DatasetJoin.to_dataset_id.in_(member_ids),
                )
            )
        ).scalars()
    )
    return ModelGraph.build(member_ids, datasets, joins)


async def load_columns(
    db: AsyncSession, graph: ModelGraph
) -> dict[str, set[str]]:
    """Live column names per member dataset (one `information_schema` read each).

    Read from the source rather than cached in metadata: a row condition must be validated
    against the table that actually exists, and `dataset_columns` is not a reliable mirror.

    The reads run **concurrently**: each one is a fresh connection (``NullPool``), so a
    ten-dataset model was paying ten serial connection setups before every restricted query.
    A table that cannot be read is left out, so a column that only exists there is reported
    unknown instead of silently trusted.
    """
    entries = [
        (dataset_id, dataset)
        for dataset_id, dataset in graph.datasets.items()
        if dataset.kind == "table"
    ]
    if not entries:
        return {}

    # Sources came with the datasets (`joinedload` in `load_model_graph`): a `db.get` per source here was a round trip
    # that answered a question the first query had already answered.
    sources = {
        dataset.data_source_id: dataset.data_source_rel
        for _, dataset in entries
        if dataset.data_source_rel is not None
    }

    async def one(dataset: Dataset) -> tuple[str, set[str] | None]:
        ds = sources.get(dataset.data_source_id)
        if ds is None or ds.kind != "postgresql":
            return dataset.id, None
        if not is_valid_identifier(dataset.schema_name) or not is_valid_identifier(
            dataset.table_name
        ):
            return dataset.id, None
        try:
            names = await asyncio.to_thread(
                cached_column_names, ds, dataset.schema_name, dataset.table_name
            )
        except (ColumnError, OSError):
            return dataset.id, None
        return dataset.id, set(names)

    out: dict[str, set[str]] = {}
    for dataset_id, columns in await asyncio.gather(*(one(d) for _, d in entries)):
        if columns is not None:
            out[dataset_id] = columns
    return out


@dataclass(frozen=True)
class EntityScope:
    """A resource's row policy, ready to compile against whichever base a query uses."""

    graph: ModelGraph
    policy: list[dict[str, Any]]
    claims: dict[str, Any]
    columns_by_dataset: dict[str, set[str]]
    #: Columns this scope touched, for audit.
    claims_used: tuple[str, ...] = ()


async def build_entity_scope(
    db: AsyncSession,
    *,
    graph: ModelGraph,
    policy: list[dict[str, Any]],
    claims: dict[str, Any],
) -> EntityScope:
    """Validate the policy against the model and capture the columns it needs."""
    conditions = validate_policy(policy)
    columns = await load_columns(db, graph) if conditions else {}
    if conditions:
        # Resolve every attribution and every claim **now**: a policy whose column cannot be
        # placed, or whose claim the caller does not carry, must reject the call here rather
        # than defer to query time (where a partial compile could look like success).
        for condition in conditions:
            _owner_of(graph, columns, str(condition["column"]))
            if "claim" in condition:
                _claim_value(str(condition["claim"]), claims)
    claims_used = tuple(
        sorted({str(c["claim"]) for c in conditions if isinstance(c, dict) and "claim" in c})
    )
    return EntityScope(
        graph=graph,
        policy=conditions,
        claims=claims,
        columns_by_dataset=columns,
        claims_used=claims_used,
    )


def _owner_of(
    graph: ModelGraph, columns_by_dataset: dict[str, set[str]], column: str
) -> str:
    """The single dataset that declares `column`; raises when unknown or ambiguous."""
    qualifier, bare = _split_column(column)
    if not is_valid_identifier(bare):
        raise EntityScopeError(
            f"Invalid row condition column: {column!r}",
            QueryFailure("ROW_POLICY_INVALID", REQUEST),
        )
    if qualifier is not None:
        matches = graph.datasets_matching(qualifier)
        if not matches:
            raise EntityScopeError(
                f"Row condition column '{column}' names an unknown dataset '{qualifier}'.",
                QueryFailure("ROW_POLICY_UNKNOWN_DATASET", REQUEST),
            )
        if len(matches) > 1:
            raise EntityScopeError(
                f"Row condition column '{column}' names an ambiguous dataset '{qualifier}'.",
                QueryFailure("ROW_POLICY_AMBIGUOUS_COLUMN", REQUEST),
            )
        return matches[0]

    owners = [
        dataset_id
        for dataset_id, cols in columns_by_dataset.items()
        if dataset_id in graph.dataset_ids and bare in cols
    ]
    if not owners:
        raise EntityScopeError(
            f"Row condition column '{column}' is not a column of this model.",
            QueryFailure("ROW_POLICY_UNKNOWN_COLUMN", REQUEST),
        )
    if len(owners) > 1:
        names = ", ".join(sorted(graph.labels.get(o, o) for o in owners))
        raise EntityScopeError(
            f"Row condition column '{column}' exists on several datasets ({names}); "
            "qualify it as <dataset>.<column>.",
            QueryFailure("ROW_POLICY_AMBIGUOUS_COLUMN", REQUEST),
        )
    return owners[0]


def _chain_sql(
    graph: ModelGraph,
    path: tuple[str, ...],
    *,
    start_dataset_id: str,
    start_alias: str,
    owner_alias: str,
) -> tuple[str, str]:
    """`FROM`/`JOIN` text reaching the last hop, plus the correlation back to the base.

    The first hop's comparison is returned separately so it can sit in the subquery's `WHERE`:
    a correlated column is always legal there, while some engines reject it in `JOIN … ON`.
    """
    current_id = start_dataset_id
    current_alias = start_alias
    joins_sql: list[str] = []
    correlation: list[str] = []
    for index, join_id in enumerate(path):
        join = graph.joins[join_id]
        forward = join.from_dataset_id == current_id
        other_id = join.to_dataset_id if forward else join.from_dataset_id
        other = graph.datasets.get(other_id)
        if other is None:
            raise EntityScopeError(
                "Relationship points at a dataset outside this model.",
                QueryFailure("ROW_POLICY_NO_PATH", REQUEST),
            )
        from_cols = list(join.from_columns or [])
        to_cols = list(join.to_columns or [])
        if not from_cols or len(from_cols) != len(to_cols):
            raise EntityScopeError(
                f"Relationship '{join_id}' has misaligned columns.",
                QueryFailure("ROW_POLICY_NO_PATH", REQUEST),
            )
        alias = owner_alias if index == len(path) - 1 else f"{owner_alias}h{index}"
        terms: list[str] = []
        for from_col, to_col in zip(from_cols, to_cols, strict=True):
            if not (is_valid_identifier(from_col) and is_valid_identifier(to_col)):
                raise EntityScopeError(
                    f"Relationship '{join_id}' has an invalid column.",
                    QueryFailure("ROW_POLICY_NO_PATH", REQUEST),
                )
            left_col, right_col = (from_col, to_col) if forward else (to_col, from_col)
            terms.append(
                f'{current_alias}.{_quote(left_col)} = {alias}.{_quote(right_col)}'
            )
        if index == 0:
            joins_sql.append(f"{_qualified(other)} {alias}")
            correlation.extend(terms)
        else:
            joins_sql.append(
                f'JOIN {_qualified(other)} {alias} ON ' + " AND ".join(terms)
            )
        current_id = other_id
        current_alias = alias
    return " ".join(joins_sql), " AND ".join(correlation)


def _forward_only(graph: ModelGraph, path: tuple[str, ...], start_dataset_id: str) -> bool:
    """True when every hop walks the many → one direction.

    Merging conditions changes meaning unless at most one owner row can match a base row: two
    separate `EXISTS` let different owner rows satisfy different conditions, one `EXISTS … AND …`
    demands a single row satisfy all of them. A path that ever walks a relationship backwards
    (one → many) can match several owner rows, so those conditions stay separate.
    """
    current = start_dataset_id
    for join_id in path:
        join = graph.joins[join_id]
        if join.from_dataset_id != current:
            return False
        current = join.to_dataset_id
    return True


def _owner_row_is_unique(graph: ModelGraph, path: tuple[str, ...], owner_id: str) -> bool:
    """True when the final hop's `to` columns are the owner's declared PK or unique key."""
    join = graph.joins[path[-1]]
    to_columns = {str(c) for c in (join.to_columns or [])}
    dataset = graph.datasets.get(owner_id)
    if dataset is None or not to_columns:
        return False
    declared: list[set[str]] = []
    if dataset.primary_key_columns:
        declared.append({str(c) for c in dataset.primary_key_columns})
    for key in dataset.unique_keys or []:
        if key:
            declared.append({str(c) for c in key})
    return to_columns in declared


def _mergeable(graph: ModelGraph, path: tuple[str, ...], start: str, owner: str) -> bool:
    """Whether several conditions on one owner may share a single `EXISTS`."""
    return _forward_only(graph, path, start) and _owner_row_is_unique(graph, path, owner)


def compile_entity_scope(
    scope: EntityScope,
    *,
    base_dataset_id: str,
    base_alias: str,
    key_prefix: str = "rp",
) -> tuple[list[str], dict[str, Any]]:
    """Conditions constraining a query whose base table is `base_dataset_id`."""
    where: list[str] = []
    params: dict[str, Any] = {}

    # Resolve ownership once, then group so conditions landing on the same dataset can share a
    # subquery. Each separate `EXISTS` re-reads the base table, so three conditions on one
    # dimension cost three semi-joins where one would do.
    resolved: list[tuple[int, dict[str, Any], str, str]] = []
    groups: dict[str, list[int]] = {}
    for index, condition in enumerate(scope.policy):
        column = str(condition["column"])
        owner = _owner_of(scope.graph, scope.columns_by_dataset, column)
        _, bare = _split_column(column)
        resolved.append((index, condition, owner, bare))
        if owner != base_dataset_id:
            groups.setdefault(owner, []).append(index)

    by_index = {index: (condition, owner, bare) for index, condition, owner, bare in resolved}
    emitted: set[int] = set()

    for index, condition, owner, bare in resolved:
        if index in emitted:
            continue
        if owner == base_dataset_id:
            rendered, rendered_params = policy_conditions(
                [{**condition, "column": bare}],
                alias=base_alias,
                claims=scope.claims,
                key_prefix=f"{key_prefix}c{index}_",
            )
            params.update(rendered_params)
            where.append(rendered[0])
            emitted.add(index)
            continue

        path = scope.graph.path_between(base_dataset_id, owner)
        if path is None:
            raise EntityScopeError(
                f"Row condition on '{scope.graph.labels.get(owner, owner)}' has no unique join "
                f"path from '{scope.graph.labels.get(base_dataset_id, base_dataset_id)}', so "
                "this query cannot be constrained.",
                QueryFailure("ROW_POLICY_NO_PATH", REQUEST),
            )

        siblings = groups[owner]
        merge = len(siblings) > 1 and _mergeable(
            scope.graph, path, base_dataset_id, owner
        )
        group_indices = siblings if merge else [index]
        emitted.update(group_indices)

        owner_alias = f"rpo{index}"
        from_sql, correlation = _chain_sql(
            scope.graph,
            path,
            start_dataset_id=base_dataset_id,
            start_alias=base_alias,
            owner_alias=owner_alias,
        )
        parts: list[str] = []
        for member in group_indices:
            member_condition, _, member_bare = by_index[member]
            rendered, rendered_params = policy_conditions(
                [{**member_condition, "column": member_bare}],
                alias=owner_alias,
                claims=scope.claims,
                key_prefix=f"{key_prefix}c{member}_",
            )
            params.update(rendered_params)
            parts.append(rendered[0])
        where.append(
            f"EXISTS (SELECT 1 FROM {from_sql} WHERE {correlation} AND {' AND '.join(parts)})"
        )
    return where, params
