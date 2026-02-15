function matchPattern(inputLine, pattern) {
  if (pattern.startsWith('^')) {
    return matchHere(inputLine, pattern.slice(1));
  }

  if (pattern.length === 0) return true;

  for (let i = 0; i <= inputLine.length; i++) {
    if (matchHere(inputLine.slice(i), pattern)) {
      return true;
    }
  }
  return false;
}

function matchHere(line, pattern) {
  if (pattern.length === 0) {
    return true;
  }

  if (pattern === "$") {
    return line.length === 0;
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
      if (matchHere(line, option + restPattern)) {
        return true;
      }
    }
    return false;
  }

  if (restPattern.startsWith("+")) {
    return matchOneOrMore(line, token, restPattern.slice(1));
  }

  if (restPattern.startsWith("?")) {
    return matchZeroOrOne(line, token, restPattern.slice(1));
  }

  if (line.length > 0 && matchChar(line[0], token)) {
    return matchHere(line.slice(1), restPattern);
  }

  return false;
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

  if (i === 0) return false;

  // Backtrack
  while (i > 0) {
    if (matchHere(line.slice(i), remainingPattern)) {
      return true;
    }
    i--;
  }

  return false;
}

function matchZeroOrOne(line, token, remainingPattern) {
  if (line.length > 0 && matchChar(line[0], token)) {
    if (matchHere(line.slice(1), remainingPattern)) {
      return true;
    }
  }
  return matchHere(line, remainingPattern);
}

function main() {
  const pattern = process.argv[3];
  const inputLine = require("fs").readFileSync(0, "utf-8").trim();

  if (process.argv[2] !== "-E") {
    console.log("Expected first argument to be '-E'");
    process.exit(1);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here");

  // TODO: Uncomment the code below to pass the first stage
  if (matchPattern(inputLine, pattern)) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
