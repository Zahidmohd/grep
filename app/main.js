const fs = require("fs");

function matchPattern(inputLine, pattern) {
  if (pattern.startsWith('^')) {
    const length = matchHere(inputLine, pattern.slice(1));
    return length !== null ? [{ start: 0, end: length, match: inputLine.slice(0, length) }] : [];
  }

  const matches = [];
  let i = 0;

  if (pattern.length === 0) return [{ start: 0, end: 0, match: "" }];

  while (i <= inputLine.length) {
    const length = matchHere(inputLine.slice(i), pattern);
    if (length !== null) {
      matches.push({ start: i, end: i + length, match: inputLine.slice(i, i + length) });
      if (length > 0) {
        i += length;
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return matches;
}

function matchHere(line, pattern) {
  if (pattern.length === 0) {
    return 0;
  }

  if (pattern === "$") {
    return line.length === 0 ? 0 : null;
  }

  // Parse next token
  let token = "";
  let tokenLength = 0;

  if (pattern.startsWith("(")) {
    const end = pattern.indexOf(")");
    token = pattern.slice(0, end + 1);
    tokenLength = end + 1;
  } else if (pattern.startsWith("[")) {
    const end = pattern.indexOf("]");
    token = pattern.slice(0, end + 1);
    tokenLength = end + 1;
  } else if (pattern.startsWith("\\")) {
    token = pattern.slice(0, 2);
    tokenLength = 2;
  } else {
    token = pattern[0];
    tokenLength = 1;
  }

  const restPattern = pattern.slice(tokenLength);

  if (token.startsWith("(")) {
    const content = token.slice(1, -1);
    const options = content.split("|");
    for (const option of options) {
      const length = matchHere(line, option + restPattern);
      if (length !== null) {
        return length;
      }
    }
    return null;
  }

  if (restPattern.startsWith("+")) {
    return matchOneOrMore(line, token, restPattern.slice(1));
  }

  if (restPattern.startsWith("*")) {
    return matchZeroOrMore(line, token, restPattern.slice(1));
  }

  if (restPattern.startsWith("?")) {
    return matchZeroOrOne(line, token, restPattern.slice(1));
  }

  if (line.length > 0 && matchChar(line[0], token)) {
    const remainingLength = matchHere(line.slice(1), restPattern);
    if (remainingLength !== null) {
      return 1 + remainingLength;
    }
  }

  return null;
}

function matchChar(char, token) {
  if (token === ".") return char !== "\n";

  if (token.startsWith("[")) {
    const content = token.slice(1, -1);
    if (content.startsWith("^")) {
      return !content.slice(1).includes(char);
    }
    return content.includes(char);
  }

  if (token.startsWith("\\")) {
    const type = token[1];
    if (type === "d") return char >= "0" && char <= "9";
    if (type === "w") return (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      (char >= "0" && char <= "9") ||
      char === "_";
    return char === type;
  }

  return char === token;
}

function matchOneOrMore(line, token, remainingPattern) {
  let i = 0;
  // Greedy match
  while (i < line.length && matchChar(line[i], token)) {
    i++;
  }

  if (i === 0) return null;

  // Backtrack
  while (i > 0) {
    const remainingLength = matchHere(line.slice(i), remainingPattern);
    if (remainingLength !== null) {
      return i + remainingLength;
    }
    i--;
  }

  return null;
}

function matchZeroOrMore(line, token, remainingPattern) {
  let i = 0;
  // Greedy match
  while (i < line.length && matchChar(line[i], token)) {
    i++;
  }

  // Backtrack
  while (i >= 0) {
    const remainingLength = matchHere(line.slice(i), remainingPattern);
    if (remainingLength !== null) {
      return i + remainingLength;
    }
    i--;
  }

  return null;
}

function matchZeroOrOne(line, token, remainingPattern) {
  if (line.length > 0 && matchChar(line[0], token)) {
    const remainingLength = matchHere(line.slice(1), remainingPattern);
    if (remainingLength !== null) {
      return 1 + remainingLength;
    }
  }
  return matchHere(line, remainingPattern);
}

function main() {
  const args = process.argv.slice(2);
  let printOnly = false;
  let pattern = "";
  let useColor = false;
  let filePath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o") {
      printOnly = true;
    } else if (arg === "--color=always") {
      useColor = true;
    } else if (arg === "--color=auto") {
      useColor = !!process.stdout.isTTY;
    } else if (arg === "--color=never") {
      useColor = false;
    } else if (arg === "-E") {
      pattern = args[i + 1];
      i++; // Skip pattern
    } else {
      // Only treat as file path if it's not a known flag check skip
      if (!arg.startsWith("-")) {
        filePath = arg;
      }
    }
  }

  if (!pattern) {
    console.log("Expected -E");
    process.exit(1);
  }

  let input = "";
  try {
    if (filePath) {
      input = fs.readFileSync(filePath, "utf-8");
    } else {
      input = fs.readFileSync(0, "utf-8");
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here");

  const lines = input.split("\n");
  if (input.endsWith("\n")) {
    lines.pop();
  }

  let anyMatch = false;

  for (const line of lines) {
    const matches = matchPattern(line, pattern);
    if (matches.length > 0) {
      if (printOnly) {
        for (const m of matches) {
          console.log(m.match);
        }
      } else {
        if (useColor) {
          let result = "";
          let lastIndex = 0;
          for (const m of matches) {
            if (m.start >= lastIndex) {
              result += line.slice(lastIndex, m.start);
              result += `\x1b[1;31m${m.match}\x1b[0m`;
              lastIndex = m.end;
            }
          }
          result += line.slice(lastIndex);
          console.log(result);
        } else {
          console.log(line);
        }
      }
      anyMatch = true;
    }
  }

  if (anyMatch) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
