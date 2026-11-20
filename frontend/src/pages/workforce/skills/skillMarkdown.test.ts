import { describe, expect, it } from "vitest";
import { joinSkillFile, splitSkillFile } from "./skillMarkdown";

const SAMPLE = `---
name: contract-review
description: 审阅合同条款。需要核对付款条款时使用。
entrypoint: scripts/cli.py
subcommands: [check, diff]
---

## 何时使用

核对付款条款时。
`;

describe("skillMarkdown", () => {
  it("reads the frontmatter the editor renders as fields", () => {
    const { frontmatter, body } = splitSkillFile(SAMPLE);
    expect(frontmatter.name).toBe("contract-review");
    expect(frontmatter.description).toBe(
      "审阅合同条款。需要核对付款条款时使用。",
    );
    expect(frontmatter.entrypoint).toBe("scripts/cli.py");
    expect(frontmatter.subcommands).toEqual(["check", "diff"]);
    expect(body.trim().startsWith("## 何时使用")).toBe(true);
  });

  it("treats a file without frontmatter as body only", () => {
    const { frontmatter, body } = splitSkillFile("# 标题\n正文");
    expect(frontmatter.name).toBe("");
    expect(frontmatter.subcommands).toEqual([]);
    expect(body).toBe("# 标题\n正文");
  });

  it("round-trips what it writes", () => {
    const { frontmatter, body } = splitSkillFile(SAMPLE);
    const again = splitSkillFile(joinSkillFile(frontmatter, body));
    expect(again.frontmatter).toEqual(frontmatter);
    expect(again.body.trim()).toBe(body.trim());
  });

  it("omits entrypoint lines when there is no script", () => {
    const text = joinSkillFile(
      {
        name: "notes",
        description: "说明型技能",
        entrypoint: "",
        subcommands: [],
      },
      "正文",
    );
    expect(text).not.toContain("entrypoint:");
    expect(text).not.toContain("subcommands:");
  });
});
