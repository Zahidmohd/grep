function matchPattern(inputLine, pattern) {
  if (pattern.length === 1) {
    return inputLine.includes(pattern);
  } else if (pattern === "\\d") {
    for (let i = 0; i < inputLine.length; i++) {
      if (inputLine[i] >= "0" && inputLine[i] <= "9") {
        return true;
      }
    }
    return false;
  } else if (pattern === "\\w") {
    for (let i = 0; i < inputLine.length; i++) {
      const char = inputLine[i];
      if ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || (char >= "0" && char <= "9") || char === "_") {
        return true;
      }
    }
    return false;
  } else if (pattern.startsWith("[") && pattern.endsWith("]")) {
    const chars = pattern.slice(1, -1);
    for (const char of chars) {
      if (inputLine.includes(char)) {
        return true;
      }
    }
    return false;
  } else {
    throw new Error(`Unhandled pattern ${pattern}`);
  }
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
