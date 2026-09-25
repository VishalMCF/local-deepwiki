export interface AskContext {
  repoName: string;
  repoPath: string;
  question: string;
  wikiOutline: string;
  history?: { role: string; content: string }[];
}

export function askPrompt(ctx: AskContext): string {
  const history = ctx.history?.length
    ? `\nEarlier turns in this conversation (for context; do not repeat them):\n${ctx.history
        .map((m) => `${m.role === 'USER' ? 'Q' : 'A'}: ${truncate(m.content, 1200)}`)
        .join('\n\n')}\n`
    : '';

  return `You are answering a question about the codebase "${ctx.repoName}" at ${ctx.repoPath}.

You are analysing a read-only checkout. Never modify, create or delete files. Use only Read, Grep and Glob (or equivalent read-only shell commands such as cat/rg/sed -n/ls).

A wiki already exists for this repo with these pages: ${ctx.wikiOutline}
${history}
Question: ${ctx.question}

How to answer:
- Investigate the actual code before answering. Open the files you need. Never answer from the filename alone.
- Emit the answer and nothing else. Never narrate your process: no "Let me check", no "Now I have a complete picture", no summary of what you just read.
- Answer directly and concretely. Lead with the answer, then the supporting detail.
- Cite every claim inline with a backticked \`path/to/file.ext:START-END\` reference using real line numbers you observed. These render as clickable links to the code, so they must be accurate.
- Use markdown: headings for multi-part answers, tables for enumerations, fenced code blocks for snippets.
- Include a \`\`\`mermaid diagram when a flow or structure is easier shown than described.
- End with a line exactly of the form:
  Sources: path/to/file.ext:12-48, other/file.ext:5-7
  listing every file and line range the answer relies on. Paths relative to the repo root.
- If the codebase does not answer the question, say so plainly rather than speculating.`;
}


function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
