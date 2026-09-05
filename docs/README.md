# EquityWise documentation

The documentation is organised into major categories by purpose. Add new
Markdown files under the category that fits; the structure is designed to scale
without reorganisation.

| Category | Purpose |
| --- | --- |
| [architecture/](architecture/) | How the system is built — system design, data model, and the reasoning behind it |
| [operations/](operations/) | Running the system in production — deployment, infrastructure, runbooks |
| [planning/](planning/) | Where the product is going — roadmap, backlog, and design plans for work not yet built |
| [guides/](guides/) | How-to and task-oriented documentation for developers |
| [reference/](reference/) | Look-up material — configuration, schema, and API reference |

## Conventions

- Everything is Markdown (`.md`).
- Each category folder has a `README.md` that indexes its contents.
- File names are kebab-case and describe the document, not its category
  (`deployment.md`, not `operations-deployment.md`).
- A document belongs to exactly one category; cross-link rather than duplicate.
