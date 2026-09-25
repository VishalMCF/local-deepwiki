export interface RepoFacts {
  name: string;
  path: string;
  languages: string[];
  entrypoints: string[];
  topLevel: string[];
  readmeExcerpt?: string;
  fileCount: number;
}

const READ_ONLY = `You are analysing a read-only checkout. Never modify, create or delete files. Use only Read, Grep and Glob (or equivalent read-only shell commands such as cat/rg/sed -n/ls).`;

export function outlinePrompt(facts: RepoFacts): string {
  return `${READ_ONLY}

You are generating the table of contents for a technical wiki about the codebase at ${facts.path}.

Repository facts already gathered for you:
- Name: ${facts.name}
- Files: ${facts.fileCount}
- Languages: ${facts.languages.join(', ') || 'unknown'}
- Top-level entries: ${facts.topLevel.join(', ')}
- Likely entrypoints: ${facts.entrypoints.join(', ') || 'none detected'}
${facts.readmeExcerpt ? `- README excerpt:\n"""\n${facts.readmeExcerpt}\n"""` : ''}

Explore the repository enough to understand its real architecture — do not guess from filenames alone. Read the entrypoints, the main modules, the build/config files and the README.

Then design a wiki outline. Rules:
- 5 to 9 top-level pages. Each may have 0-4 child pages. Maximum depth 2.
- The first page MUST be "Overview".
- Pages describe THIS codebase's actual concepts, not generic headings. Prefer "Master Server" over "Backend", "Data Distribution and Replication" over "Advanced Topics".
- Group by architecture and capability, not by directory listing.
- Typical shape: Overview, Architecture (+ per-component children), API Reference (+ children), Operational Guide (+ children), Development Guide (+ children).
- "hint" tells the writer of that page what to cover and which files to start from. Be specific: name real files.

Reply with a short paragraph describing the system, then a single fenced json block, and nothing after it:

\`\`\`json
{
  "title": "short display title for the repo",
  "description": "one sentence, max 160 chars",
  "primaryLanguage": "Go",
  "pages": [
    {
      "slug": "overview",
      "title": "Overview",
      "summary": "one sentence describing what this page covers",
      "hint": "cover X and Y; start from README.md and src/server.go",
      "children": [
        { "slug": "master-server", "title": "Master Server", "summary": "...", "hint": "..." }
      ]
    }
  ]
}
\`\`\``;
}

export interface PageContext {
  repoName: string;
  repoPath: string;
  title: string;
  summary?: string;
  hint?: string;
  outlineTitles: string[];
  parentTitle?: string;
}

export function pagePrompt(ctx: PageContext): string {
  return `${READ_ONLY}

You are writing ONE page of a technical wiki for the codebase "${ctx.repoName}" at ${ctx.repoPath}.

Page to write: "${ctx.title}"${ctx.parentTitle ? ` (a subsection of "${ctx.parentTitle}")` : ''}
${ctx.summary ? `Scope: ${ctx.summary}` : ''}
${ctx.hint ? `Guidance: ${ctx.hint}` : ''}

Other pages in this wiki (link to them with markdown links to their slug, e.g. [Architecture](architecture)); do NOT duplicate their content:
${ctx.outlineTitles.join(', ')}

Read the relevant source files before writing. Every factual claim must come from code you actually opened.

Output format — markdown only, no preamble, no "here is the page":
1. Start with an H1: "# ${ctx.title}".
2. Use H2/H3 for sections. Write in the present tense, third person, technical register. No marketing language.
3. Explain mechanisms, not just names: how data moves, what calls what, what the invariants are.
4. Include at least one mermaid diagram where a structure or flow benefits from it, fenced as \`\`\`mermaid. Use graph TD / sequenceDiagram / flowchart. Keep node labels short; put the file name in the label when it identifies a component, e.g. "Master Server (src/server.go)".
5. Use markdown tables for API surfaces, config options and enumerations.
6. Reference code inline as backticked \`path/to/file.ext:START-END\` using real line numbers you observed.
7. After EVERY H2 section, add a line exactly of the form:
   Sources: path/to/file.ext:12-48, other/file.ext:5-7
   listing the files and line ranges that section is derived from. Paths must be relative to the repo root. Never invent a path or a line range.
8. Do not include a "Sources" heading, a table of contents, or a conclusion section.

Target length: 400-900 words for a child page, 600-1400 for a top-level page.`;
}
