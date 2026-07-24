export const DEFAULT_FUNCTION_TEMPLATE = `"""Ontology Function — edit and Run to preview."""
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    """Return a JSON-serializable dict."""
    return {"ok": True, "message": "Hello from openKMS Function"}
`;

export const DEFAULT_PREVIEW_INPUT = '{\n  "name": "openKMS"\n}';
