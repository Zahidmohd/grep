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
  if (line.length === 0) {
    return false;
  }

  // Handle character groups [...]
  if (pattern.startsWith("[")) {
    const endIndex = pattern.indexOf("]");
    if (endIndex !== -1) {
      const groupContent = pattern.slice(1, endIndex);
      const remainingPattern = pattern.slice(endIndex + 1);

      let isMatch = false;
      if (groupContent.startsWith("^")) {
        const negativeChars = groupContent.slice(1);
        isMatch = !negativeChars.includes(line[0]);
      } else {
        isMatch = groupContent.includes(line[0]);
      }

      if (isMatch) {
        return matchHere(line.slice(1), remainingPattern);
      }
      return false;
    }
  }

  // Handle escaped characters
  if (pattern.startsWith("\\")) {
    const type = pattern[1];
    const remainingPattern = pattern.slice(2);

    let isMatch = false;
    if (type === "d") {
      isMatch = (line[0] >= "0" && line[0] <= "9");
    } else if (type === "w") {
      isMatch = (line[0] >= "a" && line[0] <= "z") ||
        (line[0] >= "A" && line[0] <= "Z") ||
        (line[0] >= "0" && line[0] <= "9") ||
        (line[0] === "_");
    } else {
      isMatch = (line[0] === type);
    }

    if (isMatch) {
      return matchHere(line.slice(1), remainingPattern);
    }
    return false;
  }

  // Handle literals
  if (line[0] === pattern[0]) {
    return matchHere(line.slice(1), pattern.slice(1));
  }

  return false;
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
