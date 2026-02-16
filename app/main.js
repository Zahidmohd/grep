const fs = require("fs");
const path = require("path");

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
      if (!arg.startsWith("-")) {
        filePaths.push(arg);
      }
    }
  }

  if (!pattern) {
    if (filePaths.length === 0) {
      // No pattern provided and no files? usage error potentially, or pattern implicit?
      // Spec says -E is provided.
      console.error("Expected -E");
      process.exit(1);
    }
  }

  // Collect input lines
  let inputLines = []; // { text, source }

  if (filePaths.length === 0) {
    // Stdin
    try {
      const content = fs.readFileSync(0, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        inputLines.push({ text: line, source: "(standard input)" });
      }
    } catch (e) {
      // Empty stdin
    }
  } else {
    // Files (recursive support)
    const expandedPaths = [];

    const processPath = (p) => {
      try {
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
          if (recursive) {
            const items = fs.readdirSync(p);
            for (const item of items) {
              processPath(path.join(p, item));
            }
          } else {
            console.error(`grep: ${p}: Is a directory`);
          }
        } else {
          expandedPaths.push(p);
        }
      } catch (e) {
        console.error(`grep: ${p}: No such file or directory`);
      }
    };

    for (const p of filePaths) {
      processPath(p);
    }

    // Read lines
    for (const p of expandedPaths) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        const lines = content.split("\n");
        // Handle trailing empty line from split
        if (content.endsWith("\n") && lines[lines.length - 1] === "") {
          lines.pop();
        }
        for (const line of lines) {
          inputLines.push({ text: line, source: p });
        }
      } catch (e) {
        console.error(e.message);
      }
    }
  }

  // Parse AST
  let ast;
  try {
    ast = parsePattern(pattern);
  } catch (e) {
    console.error("Invalid Regex:", e.message);
    process.exit(1);
  }

  let anyMatch = false;
  const showSource = (filePaths.length > 0 && recursive) || (filePaths.length > 1);

  for (const { text: line, source } of inputLines) {
    const matches = findMatches(line, ast);

    if (matches.length > 0) {
      anyMatch = true;

      if (printOnly) {
        for (const m of matches) {
          if (showSource) console.log(`${source}:${m.match}`);
          else console.log(m.match);
        }
      } else {
        // Construct output
        let output = line;
        if (useColor) {
          let parts = [];
          let lastIndex = 0;
          // Ensure matches are sorted and undefined/overlapping handled?
          // findMatches returns sequential greedy matches.
          for (const m of matches) {
            if (m.start >= lastIndex) {
              parts.push(line.slice(lastIndex, m.start));
              parts.push(`\x1b[31m${m.match}\x1b[0m`);
              lastIndex = m.end;
            }
          }
          parts.push(line.slice(lastIndex));
          output = parts.join("");
        }

        if (showSource) console.log(`${source}:${output}`);
        else console.log(output);
      }
    }
  }

  process.exit(anyMatch ? 0 : 1);
}

// --- AST Parser ---

function parsePattern(pattern) {
  let pos = 0;
  let groupIdCounter = 1;

  function peek() { return pattern[pos]; }
  function consume() { return pattern[pos++]; }
  function match(char) { if (peek() === char) { consume(); return true; } return false; }

  function parseSequenceContext() {
    const elements = [];
    while (pos < pattern.length) {
      if (peek() === '|' || peek() === ')') break;
      elements.push(parseAtom());
    }
    if (elements.length === 1) return elements[0];
    return { type: 'Sequence', elements };
  }

  function parseAlternationContext() {
    const left = parseSequenceContext();
    if (match('|')) {
      const right = parseAlternationContext();
      return { type: 'Alternation', left, right };
    }
    return left;
  }

  function parseAtom() {
    let base;
    const char = peek();

    if (char === '(') {
      consume();
      const id = groupIdCounter++;
      const inner = parseAlternationContext();
      if (!match(')')) throw new Error("Unmatched (");
      base = { type: 'Group', number: id, inner };
    } else if (char === '[') {
      consume();
      let inverted = false;
      if (match('^')) inverted = true;
      let inclusions = "";
      while (pos < pattern.length && peek() !== ']') {
        inclusions += consume();
      }
      if (!match(']')) throw new Error("Unmatched [");
      base = { type: 'CharClass', inverted, inclusions };
    } else if (char === '\\') {
      consume();
      const special = consume();
      if (special >= '1' && special <= '9') {
        base = { type: 'Backref', index: parseInt(special) };
      } else if (special === 'd' || special === 'w') {
        base = { type: 'SpecialClass', value: special };
      } else {
        base = { type: 'Literal', value: special };
      }
    } else if (char === '.') {
      consume();
      base = { type: 'Dot' };
    } else if (char === '^') {
      consume();
      base = { type: 'AnchorStart' };
    } else if (char === '$') {
      consume();
      base = { type: 'AnchorEnd' };
    } else {
      base = { type: 'Literal', value: consume() };
    }

    // Check Quantifier
    if (pos < pattern.length) {
      const q = peek();
      if (q === '+') {
        consume();
        return { type: 'Quantifier', inner: base, min: 1, max: Infinity };
      } else if (q === '*') {
        consume();
        return { type: 'Quantifier', inner: base, min: 0, max: Infinity };
      } else if (q === '?') {
        consume();
        return { type: 'Quantifier', inner: base, min: 0, max: 1 };
      } else if (q === '{') {
        consume();
        // Parse range
        const start = pos;
        while (pos < pattern.length && peek() !== '}') pos++;
        const content = pattern.slice(start, pos);
        consume(); // }

        if (content.includes(',')) {
          const parts = content.split(',');
          const min = parseInt(parts[0]);
          const maxPart = parts[1];
          const max = maxPart === "" ? Infinity : parseInt(maxPart);
          return { type: 'Quantifier', inner: base, min, max };
        } else {
          const times = parseInt(content);
          return { type: 'Quantifier', inner: base, min: times, max: times };
        }
      }
    }

    return base;
  }

  // Initial parse
  return parseAlternationContext();
}

// --- Matcher ---

function findMatches(line, ast) {
  const matches = [];

  if (ast.type === 'AnchorStart') {
    const res = matchSequence(line, [ast.inner || ast], 0, []); // AnchorStart usually wraps nothing or is just a node.

    if (ast.type === 'Sequence' && ast.elements[0].type === 'AnchorStart') {
      // Sequence starting with AnchorStart - handled by matchSequence calling matchSingleNode(AnchorStart)
    }
  }

  // Scan line
  let i = 0;
  while (i <= line.length) {

    const nodes = (ast.type === 'Sequence') ? ast.elements : [ast];
    const res = matchSequence(line, nodes, i, []);

    if (res) {
      matches.push({ start: i, end: i + res.length, match: line.slice(i, i + res.length) });
      if (res.length > 0) i += res.length;
      else i++;
    } else {
      i++;
    }
  }
  return matches;
}

function matchSequence(line, nodes, offset, captures) {
  if (nodes.length === 0) return { length: 0, captures };

  const [head, ...tail] = nodes;

  if (head.type === 'Quantifier') {
    const min = head.min;
    const max = head.max;
    const inner = head.inner;

    let possibleMatches = [];
    let currentOffset = offset;
    let currentCaptures = [...captures];
    let count = 0;

    // Match Min
    while (count < min) {
      const res = matchSingleNode(line, inner, currentOffset, currentCaptures);
      if (!res) return null;
      possibleMatches.push(res);
      currentOffset += res.length;
      currentCaptures = res.captures;
      count++;
    }

    // Match Extra (Greedy)
    const mandatoryMatches = [...possibleMatches];
    const mandatoryOffset = currentOffset;
    const mandatoryCaptures = currentCaptures;

    const extraMatches = [];
    while (count < max) {
      const res = matchSingleNode(line, inner, currentOffset, currentCaptures);
      if (!res) break;
      if (res.length === 0) break; // Infinite loop protection
      extraMatches.push(res);
      currentOffset += res.length;
      currentCaptures = res.captures;
      count++;
    }

    // Backtrack
    for (let i = extraMatches.length; i >= 0; i--) {
      // Reconstruct state
      let myOffset = mandatoryOffset;
      let myCaptures = mandatoryCaptures;
      for (let k = 0; k < i; k++) {
        myOffset += extraMatches[k].length;
        myCaptures = extraMatches[k].captures;
      }

      const tailRes = matchSequence(line, tail, myOffset, myCaptures);
      if (tailRes) {
        return { length: (myOffset - offset) + tailRes.length, captures: tailRes.captures };
      }
    }
    return null;

  } else if (head.type === 'Alternation') {
    // Left | Right
    const leftNodes = (head.left.type === 'Sequence') ? head.left.elements : [head.left];
    const resLeft = matchSequence(line, [...leftNodes, ...tail], offset, captures);
    if (resLeft) return resLeft;

    const rightNodes = (head.right.type === 'Sequence') ? head.right.elements : [head.right];
    return matchSequence(line, [...rightNodes, ...tail], offset, captures);

  } else {
    // Atomic
    const res = matchSingleNode(line, head, offset, captures);
    if (res) {
      const tailRes = matchSequence(line, tail, offset + res.length, res.captures);
      if (tailRes) {
        return { length: res.length + tailRes.length, captures: tailRes.captures };
      }
    }
    return null;
  }
}

function matchSingleNode(line, node, offset, captures) {
  if (offset > line.length) return null;
  const remaining = line.slice(offset);

  switch (node.type) {
    case 'Group': {
      const innerNodes = (node.inner.type === 'Sequence') ? node.inner.elements : [node.inner];
      const res = matchSequence(line, innerNodes, offset, captures);
      if (res) {
        const capturedStr = line.slice(offset, offset + res.length);
        const newCaps = [...res.captures];
        newCaps[node.number - 1] = capturedStr;
        return { length: res.length, captures: newCaps };
      }
      return null;
    }
    case 'Literal':
      if (remaining.startsWith(node.value)) return { length: node.value.length, captures };
      return null;
    case 'Dot':
      if (remaining.length > 0 && remaining[0] !== '\n') return { length: 1, captures };
      return null;
    case 'CharClass':
      if (remaining.length > 0) {
        const char = remaining[0];
        let matched = node.inclusions.includes(char);
        if (node.inverted) matched = !matched;
        if (matched) return { length: 1, captures };
      }
      return null;
    case 'SpecialClass':
      if (remaining.length > 0) {
        const char = remaining[0];
        let matched = false;
        if (node.value === 'd') matched = (char >= '0' && char <= '9');
        else if (node.value === 'w') matched = (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char === '_';
        if (matched) return { length: 1, captures };
      }
      return null;
    case 'Backref': {
      const index = node.index - 1;
      if (index >= 0 && index < captures.length && captures[index] !== undefined) {
        const expected = captures[index];
        if (remaining.startsWith(expected)) return { length: expected.length, captures };
      }
      return null;
    }
    case 'AnchorStart':
      if (offset === 0) return { length: 0, captures };
      return null;
    case 'AnchorEnd':
      if (offset === line.length) return { length: 0, captures };
      return null;
    case 'Sequence':
      return matchSequence(line, node.elements, offset, captures);
    case 'Alternation': {
      // Should verify this path? matchSingleNode usually called on Atom.
      // Alternation inside a Group is handled by Group->Sequence logic?
      // If Group has Alternation direct child: Group -> Alternation. 
      // matchSingleNode(Group) calls matchSequence([Alternation]).
      // matchSequence sees Alternation head. Handles it.
      return matchSequence(line, [node], offset, captures);
    }
  }
  return null;
}

main();
