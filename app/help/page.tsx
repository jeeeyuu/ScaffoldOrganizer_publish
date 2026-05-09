import { readFileSync } from "node:fs";
import path from "node:path";

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const nodes = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  function flushList() {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {listItems.map((item) => (
          <li key={item}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  function flushCode() {
    if (!codeLines.length) return;
    nodes.push(
      <pre key={`code-${nodes.length}`}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
    codeLines = [];
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      nodes.push(<h1 key={`h1-${nodes.length}`}>{line.slice(2)}</h1>);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      nodes.push(<h2 key={`h2-${nodes.length}`}>{line.slice(3)}</h2>);
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      continue;
    }

    nodes.push(<p key={`p-${nodes.length}`}>{renderInline(line)}</p>);
  }

  flushList();
  flushCode();
  return nodes;
}

export default function HelpPage() {
  const markdown = readFileSync(path.join(process.cwd(), "USER_GUIDE.md"), "utf8");

  return (
    <main className="help-shell">
      <nav className="help-nav">
        <a href="/">Back to App</a>
      </nav>
      <article className="help-doc">{renderMarkdown(markdown)}</article>
    </main>
  );
}
