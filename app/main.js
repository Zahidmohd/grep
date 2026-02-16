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

  if (token.startsWith("(") && !restPattern.startsWith("+") && !restPattern.startsWith("*") && !restPattern.startsWith("?") && !restPattern.startsWith("{")) {
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

  if (restPattern.startsWith("{")) {
    const end = restPattern.indexOf("}");
    if (end !== -1) {
      const times = parseInt(restPattern.slice(1, end), 10);
      if (!isNaN(times)) {
        return matchTimes(line, token, times, restPattern.slice(end + 1));
      }
    }
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

function matchToken(line, token) {
  if (line.length === 0) return null;

  if (token.startsWith("(")) {
    const content = token.slice(1, -1);
    const options = content.split("|");
    for (const option of options) {
      // Check if option matches at start of line
      const len = matchHere(line, option);
      // matchHere matched the option AND the rest... wait.
      // matchHere(line, pattern) checks if line starts with pattern.
      // But we only want to match the OPTION itself here, not the "rest".
      // We can hack this: matchHere(line, option + "$")? No, that expects EOL.
      // We need matchHere to just match the pattern passed and return length used.
      // Actually, matchHere(line, pattern) currently means "pattern matches at start of line".
      // Ideally if we pass just the option as pattern, it returns length of option match?
      // NO. matchHere(line, pattern) returns length of WHOLE pattern match.
      // So if pattern is "abc", it returns 3.
      // BUT matchHere logic currently recurses... 
      // If we ask matchHere(line, option), and option is "abc", 
      // it will eat 'a', call matchHere('bc'), eat 'b' call matchHere('c')... etc.
      // Eventually matchHere("", "") returns 0.
      // So yes, matchHere(original_line, option) returns length of string consumed by option.
      // IF we pass NO remaining pattern.

      const len = matchHere(line, option);
      if (len !== null) return len;
    }
    return null;
  }

  if (matchChar(line[0], token)) {
    return 1;
  }
  return null;
}

function matchOneOrMore(line, token, remainingPattern) {
  const matches = [];
  let matchedParams = [];
  let currentLine = line;
  let totalLen = 0;

  while (true) {
    const len = matchToken(currentLine, token);
    if (len === null) break;
    matches.push(len);
    totalLen += len;
    currentLine = currentLine.slice(len);
    matchedParams.push(totalLen);
  }

  for (let i = matches.length; i >= 1; i--) {
    const currentTotalLen = matchedParams[i - 1];
    const remainingLength = matchHere(line.slice(currentTotalLen), remainingPattern);
    if (remainingLength !== null) {
      return currentTotalLen + remainingLength;
    }
  }

  return null;
}

function matchZeroOrMore(line, token, remainingPattern) {
  const matches = [];
  let matchedParams = [];
  let currentLine = line;
  let totalLen = 0;

  while (true) {
    const len = matchToken(currentLine, token);
    if (len === null) break;
    matches.push(len);
    totalLen += len;
    matchedParams.push(totalLen);
  }

  for (let i = matches.length; i >= 0; i--) {
    const currentTotalLen = i === 0 ? 0 : matchedParams[i - 1];
    const remainingLength = matchHere(line.slice(currentTotalLen), remainingPattern);
    if (remainingLength !== null) {
      return currentTotalLen + remainingLength;
    }
  }

  return null;
}

function matchTimes(line, token, times, remainingPattern) {
  let currentLine = line;
  let totalLen = 0;

  for (let i = 0; i < times; i++) {
    const len = matchToken(currentLine, token);
    if (len === null) return null;
    totalLen += len;
    currentLine = currentLine.slice(len);
  }

  const remainingLength = matchHere(currentLine, remainingPattern);
  if (remainingLength !== null) {
    return totalLen + remainingLength;
  }
  return null;
}

function matchZeroOrOne(line, token, remainingPattern) {
  const len = matchToken(line, token);
  if (len !== null) {
    const remainingLength = matchHere(line.slice(len), remainingPattern);
    if (remainingLength !== null) {
      return len + remainingLength;
    }
  }
  return matchHere(line, remainingPattern);
}

function main() {
  const args = process.argv.slice(2);
  let printOnly = false;
  let pattern = "";
  let useColor = false;
  let recursive = false;
  let filePaths = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o") {
      printOnly = true;
    } else if (arg === "-r") {
      recursive = true;
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
        filePaths.push(arg);
      }
    }
  }

  if (!pattern) {
    console.log("Expected -E");
    process.exit(1);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here");

  let anyMatch = false;

  // If no files provided, read from stdin (unless recursive, which requires path)
  if (filePaths.length === 0) {
    if (!recursive) {
      filePaths.push(0); // 0 is file descriptor for stdin
    }
  }

  const expandedFilePaths = [];

  const processPath = (path) => {
    try {
      // If it's stdin (0), just add it
      if (path === 0) {
        expandedFilePaths.push(0);
        return;
      }

      const stats = fs.statSync(path);
      if (stats.isDirectory()) {
        if (recursive) {
          const items = fs.readdirSync(path);
          for (const item of items) {
            // Join path - rudimentary, assume / or \ handled by FS or construct correctly
            // In node "path" module safer, but let's try simple concat with / if needed
            // path.join would be better but trying to stick to minimal imports if possible
            // or just require "path"
            const fullPath = path.endsWith("/") || path.endsWith("\\") ? path + item : path + "/" + item;
            processPath(fullPath);
          }
        } else {
          console.error(`${path}: Is a directory`);
        }
      } else {
        expandedFilePaths.push(path);
      }
    } catch (e) {
      console.error(e.message);
    }
  };

  for (const p of filePaths) {
    processPath(p);
  }

  // Logic: if multiple files OR recursive search on directory, show prefix?
  // Standard grep: single file (explicit) -> no prefix. 
  // multiple files -> prefix. 
  // directory (-r) -> always prefix files found inside.

  const showFilename = expandedFilePaths.length > 1 || recursive;

  for (const filePath of expandedFilePaths) {
    let input = "";
    try {
      input = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
      console.error(e.message);
      continue;
    }

    const lines = input.split("\n");
    if (input.endsWith("\n")) {
      lines.pop();
    }

    for (const line of lines) {
      const matches = matchPattern(line, pattern);
      if (matches.length > 0) {
        // Fix prefix logic: only skip if explicitly single file arg and NOT recursive expansion
        // But "expandedFilePaths.length > 1" usually covers specific files. 
        // Recursive usually implies we want filenames.
        // Let's stick to "showFilename" calculated above.

        const prefix = (showFilename && typeof filePath === 'string') ? `${filePath}:` : "";

        if (printOnly) {
          for (const m of matches) {
            console.log(`${prefix}${m.match}`);
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
            console.log(`${prefix}${result}`);
          } else {
            console.log(`${prefix}${line}`);
          }
        }
        anyMatch = true;
      }
    }
  }

  if (anyMatch) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
