const fs = require("fs");
const path = require("path");

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.error("DEBUG:", ...args); };

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
      i++;
    } else {
      if (!arg.startsWith("-")) {
        filePaths.push(arg);
      }
    }
  }

  if (!pattern) {
    if (filePaths.length === 0) {
      console.error("Expected -E");
      process.exit(1);
    }
  }

  let inputLines = [];

  if (filePaths.length === 0) {
    try {
      const content = fs.readFileSync(0, "utf-8");
      const lines = content.split("\n");
      for (let line of lines) {
        if (line.endsWith('\r')) line = line.slice(0, -1);
        inputLines.push({ text: line, source: "(standard input)" });
      }
    } catch (e) {
      // Empty stdin
    }
  } else {
    const expandedPaths = [];
    const processPath = (p) => {
      try {
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
          if (recursive) {
            const items = fs.readdirSync(p);
            for (const item of items) processPath(path.join(p, item));
          } else console.error(`grep: ${p}: Is a directory`);
        } else expandedPaths.push(p);
      } catch (e) { console.error(`grep: ${p}: No such file or directory`); }
    };
    for (const p of filePaths) processPath(p);

    for (const p of expandedPaths) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        const lines = content.split("\n");
        if (content.endsWith("\n") && lines[lines.length - 1] === "") lines.pop();
        for (let line of lines) {
          if (line.endsWith('\r')) line = line.slice(0, -1);
          inputLines.push({ text: line, source: p });
        }
      } catch (e) { console.error(e.message); }
    }
  }

  let anyMatch = false;
  const showSource = (filePaths.length > 0 && recursive) || (filePaths.length > 1);

  for (const { text: line, source } of inputLines) {
    const matches = findMatches(line, pattern);

    if (matches.length > 0) {
      anyMatch = true;
      if (printOnly) {
        for (const m of matches) {
          if (showSource) console.log(`${source}:${m.match}`);
          else console.log(m.match);
        }
      } else {
        let output = line;
        if (useColor) {
          let parts = [];
          let lastIndex = 0;
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

// Global store for pre-parsed group information
let groupInfo = {};

const isUnescaped = (pattern, pos) => {
  let count = 0;
  for (let k = pos - 1; k >= 0 && pattern[k] === '\\'; k--) count++;
  return count % 2 === 0;
};

const preParseGroups = (pattern) => {
  const info = {};
  const stack = [];
  let groupCounter = 0;
  let inBracket = false;

  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') {
      i++;
      continue;
    }
    if (pattern[i] === '[' && !inBracket) {
      inBracket = true;
      continue;
    }
    if (pattern[i] === ']' && inBracket) {
      inBracket = false;
      continue;
    }
    if (inBracket) continue;

    if (pattern[i] === '(') {
      groupCounter++;
      info[i] = { number: groupCounter, end: -1 };
      stack.push(i);
    } else if (pattern[i] === ')') {
      if (stack.length > 0) {
        const startGroupIndex = stack.pop();
        if (info[startGroupIndex]) {
          info[startGroupIndex].end = i;
        }
      }
    }
  }
  return info;
};

const isWordChar = (ch) => /[A-Za-z0-9_]/.test(ch);

const findTopLevelPipes = (pattern, j_start, j_end) => {
  const splits = [];
  let depth = 0;
  let inBracket = false;
  for (let k = j_start; k < j_end; k++) {
    const ch = pattern[k];
    if (ch === '\\') {
      k++;
      continue;
    }
    if (ch === '[' && !inBracket) {
      inBracket = true;
      continue;
    }
    if (ch === ']' && inBracket) {
      inBracket = false;
      continue;
    }
    if (inBracket) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '|' && depth === 0) splits.push(k);
  }
  return splits;
};

const solve = (i, j_start, j_end, inputLine, pattern, captures) => {
  log(`solve(i=${i}, j_start=${j_start}, j_end=${j_end}) on pat='${pattern.substring(j_start, j_end)}'`);

  if (j_start >= j_end) {
    return { pos: i, captures };
  }

  const j = j_start;

  // Alternation
  const topLevelPipes = findTopLevelPipes(pattern, j_start, j_end);
  if (topLevelPipes.length > 0) {
    let last = j_start;
    const alts = [];
    for (const p of topLevelPipes) {
      alts.push([last, p]);
      last = p + 1;
    }
    alts.push([last, j_end]);

    for (const [altStart, altEnd] of alts) {
      log(`Trying alternative pat='${pattern.substring(altStart, altEnd)}'`);
      const res = solve(i, altStart, altEnd, inputLine, pattern, captures);
      if (res) return res;
    }
    return null;
  }

  // Character Class
  if (pattern[j] === '[') {
    const endBracket = pattern.indexOf(']', j + 1);
    if (endBracket === -1) return null;
    const quant = (endBracket + 1 < pattern.length) ? pattern[endBracket + 1] : null;
    const hasPlus = quant === '+';
    const hasQuestion = quant === '?';
    const next_j = endBracket + (hasPlus || hasQuestion ? 2 : 1);

    let str = pattern.slice(j + 1, endBracket);
    const isNegated = str[0] === '^';
    if (isNegated) str = str.slice(1);

    const check = (char) => isNegated ? !str.includes(char) : str.includes(char);

    if (hasPlus) {
      if (i >= inputLine.length || !check(inputLine[i])) return null;
      let matchCount = 0;
      while (i + matchCount < inputLine.length && check(inputLine[i + matchCount])) {
        matchCount++;
      }
      log(`Greedy '+' found ${matchCount} possible matches (char class).`);
      for (let k = matchCount; k >= 1; k--) {
        log(`Trying '+' match of length ${k} (char class)`);
        const res = solve(i + k, next_j, j_end, inputLine, pattern, captures);
        if (res) return res;
      }
      return null;
    }

    if (hasQuestion) {
      if (i < inputLine.length && check(inputLine[i])) {
        const tryConsume = solve(i + 1, next_j, j_end, inputLine, pattern, captures);
        if (tryConsume) return tryConsume;
      }
      return solve(i, next_j, j_end, inputLine, pattern, captures);
    }

    if (i < inputLine.length && check(inputLine[i])) {
      return solve(i + 1, next_j, j_end, inputLine, pattern, captures);
    }
    return null;
  }

  // Group
  if (pattern[j] === '(') {
    const info = groupInfo[j];
    if (!info) return null;
    const groupNum = info.number;
    const endParenIndex = info.end;
    const afterGroupIdx = endParenIndex + 1;
    const quant = (afterGroupIdx < pattern.length) ? pattern[afterGroupIdx] : null;
    const hasPlusAfterGroup = quant === '+';
    const hasQuestionAfterGroup = quant === '?';
    const next_j_after_group = endParenIndex + (hasPlusAfterGroup || hasQuestionAfterGroup ? 2 : 1);

    // Non-repeated, non-optional group
    if (!hasPlusAfterGroup && !hasQuestionAfterGroup) {
      const groupResult = solve(i, j + 1, endParenIndex, inputLine, pattern, captures);
      if (groupResult) {
        const posAfterGroup = groupResult.pos;
        const capturesFromGroup = groupResult.captures;
        const capturedValue = inputLine.slice(i, posAfterGroup);

        const newCaptures = [...capturesFromGroup];
        newCaptures[groupNum - 1] = capturedValue;
        log(`Group #${groupNum} captured '${capturedValue}'`);

        const rest = solve(posAfterGroup, next_j_after_group, j_end, inputLine, pattern, newCaptures);
        if (rest) return rest;

        // Backtrack shorter prefixes
        for (let len = capturedValue.length - 1; len >= 1; len--) {
          log(`Backtracking group #${groupNum}: trying shorter capture length ${len}`);
          const sub = inputLine.slice(i, i + len);
          const initialCaps = [...captures];
          const subResult = solve(0, j + 1, endParenIndex, sub, pattern, initialCaps);
          if (subResult && subResult.pos === sub.length) {
            const newCaps2 = [...subResult.captures];
            newCaps2[groupNum - 1] = sub;
            const finalRes = solve(i + len, next_j_after_group, j_end, inputLine, pattern, newCaps2);
            if (finalRes) return finalRes;
          }
        }
      }
      return null;
    }

    // Repeated group '+'
    if (hasPlusAfterGroup) {
      const posSnapshots = [];
      const capsSnapshots = [];
      let currPos = i;
      let currCaps = [...captures];

      while (true) {
        const subRes = solve(currPos, j + 1, endParenIndex, inputLine, pattern, currCaps);
        if (!subRes) break;
        if (subRes.pos <= currPos) break;
        currPos = subRes.pos;
        currCaps = subRes.captures;
        posSnapshots.push(currPos);
        capsSnapshots.push([...currCaps]);
      }

      if (posSnapshots.length === 0) return null;

      log(`Group at ${j} had ${posSnapshots.length} greedy repetitions (positions: ${posSnapshots})`);

      for (let rep = posSnapshots.length; rep >= 1; rep--) {
        const posAfterReps = posSnapshots[rep - 1];
        const capsAfterReps = capsSnapshots[rep - 1];
        const lastGroupCaptureValue = inputLine.slice(i, posAfterReps);
        const newCaps = [...capsAfterReps];
        newCaps[groupNum - 1] = lastGroupCaptureValue;
        log(`Trying with ${rep} repetitions for group #${groupNum}, capture='${lastGroupCaptureValue}'`);
        const rest = solve(posAfterReps, next_j_after_group, j_end, inputLine, pattern, newCaps);
        if (rest) return rest;
      }

      return null;
    }

    // Optional group '?'
    if (hasQuestionAfterGroup) {
      const groupResult = solve(i, j + 1, endParenIndex, inputLine, pattern, captures);
      if (groupResult) {
        const posAfterGroup = groupResult.pos;
        const capturesFromGroup = groupResult.captures;
        const capturedValue = inputLine.slice(i, posAfterGroup);

        const newCaptures = [...capturesFromGroup];
        newCaptures[groupNum - 1] = capturedValue;
        log(`Optional Group #${groupNum} captured '${capturedValue}'`);

        const rest = solve(posAfterGroup, next_j_after_group, j_end, inputLine, pattern, newCaptures);
        if (rest) return rest;
      }
      log(`Optional Group #${groupNum}: trying skip (0 occurrences)`);
      return solve(i, next_j_after_group, j_end, inputLine, pattern, captures);
    }
  }

  // Escapes and backreferences
  if (pattern[j] === '\\') {
    if (j + 1 >= pattern.length) return null;
    const escCh = pattern[j + 1];
    const quant = (j + 2 < pattern.length) ? pattern[j + 2] : null;
    const hasPlus = quant === '+';
    const hasQuestion = quant === '?';
    const nextIndexAfter = j + (hasPlus || hasQuestion ? 3 : 2);

    // Backreference
    if (escCh >= '1' && escCh <= '9') {
      const groupIndex = parseInt(escCh, 10) - 1;
      const groupValue = captures[groupIndex];
      if (groupValue === undefined) {
        if (hasQuestion) return solve(i, nextIndexAfter, j_end, inputLine, pattern, captures);
        return null;
      }
      if (!hasPlus && !hasQuestion) {
        if (inputLine.startsWith(groupValue, i)) {
          log(`Backref \\${groupIndex + 1} matched '${groupValue}'`);
          return solve(i + groupValue.length, nextIndexAfter, j_end, inputLine, pattern, captures);
        }
        return null;
      }

      let count = 0;
      let curr = i;
      while (inputLine.startsWith(groupValue, curr)) {
        curr += groupValue.length;
        count++;
      }
      if (hasPlus) {
        if (count === 0) return null;
        for (let k = count; k >= 1; k--) {
          const posTry = i + k * groupValue.length;
          const res = solve(posTry, nextIndexAfter, j_end, inputLine, pattern, captures);
          if (res) return res;
        }
        return null;
      } else {
        if (count >= 1) {
          const tryConsume = solve(i + groupValue.length, nextIndexAfter, j_end, inputLine, pattern, captures);
          if (tryConsume) return tryConsume;
        }
        return solve(i, nextIndexAfter, j_end, inputLine, pattern, captures);
      }
    }

    // Special classes
    if (escCh === 'w' || escCh === 'd' || escCh === 's') {
      const checkChar = (ch) => {
        if (escCh === 'w') return isWordChar(ch);
        if (escCh === 'd') return /[0-9]/.test(ch);
        return /\s/.test(ch);
      };

      if (!hasPlus && !hasQuestion) {
        if (i < inputLine.length && checkChar(inputLine[i])) {
          return solve(i + 1, nextIndexAfter, j_end, inputLine, pattern, captures);
        }
        return null;
      }

      if (hasPlus) {
        if (i >= inputLine.length || !checkChar(inputLine[i])) return null;
        let matchCount = 0;
        while (i + matchCount < inputLine.length && checkChar(inputLine[i + matchCount])) matchCount++;
        log(`Escaped '${escCh}+' greedy matched ${matchCount} chars.`);
        for (let k = matchCount; k >= 1; k--) {
          const res = solve(i + k, nextIndexAfter, j_end, inputLine, pattern, captures);
          if (res) return res;
        }
        return null;
      }

      if (hasQuestion) {
        if (i < inputLine.length && checkChar(inputLine[i])) {
          const tryConsume = solve(i + 1, nextIndexAfter, j_end, inputLine, pattern, captures);
          if (tryConsume) return tryConsume;
        }
        return solve(i, nextIndexAfter, j_end, inputLine, pattern, captures);
      }
    }

    // Generic escaped literal
    if (!hasPlus && !hasQuestion) {
      const literal = escCh;
      if (i < inputLine.length && inputLine[i] === literal) {
        return solve(i + 1, nextIndexAfter, j_end, inputLine, pattern, captures);
      }
      return null;
    }

    if (hasPlus) {
      const literal = escCh;
      if (i >= inputLine.length || inputLine[i] !== literal) return null;
      let matchCount = 0;
      while (i + matchCount < inputLine.length && inputLine[i + matchCount] === literal) matchCount++;
      for (let k = matchCount; k >= 1; k--) {
        const res = solve(i + k, nextIndexAfter, j_end, inputLine, pattern, captures);
        if (res) return res;
      }
      return null;
    }

    if (hasQuestion) {
      const literal = escCh;
      if (i < inputLine.length && inputLine[i] === literal) {
        const tryConsume = solve(i + 1, nextIndexAfter, j_end, inputLine, pattern, captures);
        if (tryConsume) return tryConsume;
      }
      return solve(i, nextIndexAfter, j_end, inputLine, pattern, captures);
    }
  }

  // Wildcard '.'
  if (pattern[j] === '.') {
    const quant = (j + 1 < pattern.length) ? pattern[j + 1] : null;
    const hasPlus = quant === '+';
    const hasQuestion = quant === '?';
    const next_j_after = j + (hasPlus || hasQuestion ? 2 : 1);

    if (!hasPlus && !hasQuestion) {
      if (i < inputLine.length) {
        return solve(i + 1, next_j_after, j_end, inputLine, pattern, captures);
      }
      return null;
    }

    if (hasPlus) {
      if (i >= inputLine.length) return null;
      let matchCount = inputLine.length - i;
      for (let k = matchCount; k >= 1; k--) {
        const res = solve(i + k, next_j_after, j_end, inputLine, pattern, captures);
        if (res) return res;
      }
      return null;
    }

    if (hasQuestion) {
      if (i < inputLine.length) {
        const tryConsume = solve(i + 1, next_j_after, j_end, inputLine, pattern, captures);
        if (tryConsume) return tryConsume;
      }
      return solve(i, next_j_after, j_end, inputLine, pattern, captures);
    }
  }

  // Literal character with quantifier
  const nextPatChar = (j + 1 < pattern.length) ? pattern[j + 1] : null;
  const literalHasPlus = nextPatChar === '+';
  const literalHasQuestion = nextPatChar === '?';
  if (literalHasPlus || literalHasQuestion) {
    const literal = pattern[j];
    let matchCount = 0;
    while (i + matchCount < inputLine.length && inputLine[i + matchCount] === literal) matchCount++;
    if (literalHasPlus) {
      if (matchCount === 0) return null;
      log(`Literal '${literal}+' greedy matched ${matchCount} times.`);
      const next_j_after = j + 2;
      for (let k = matchCount; k >= 1; k--) {
        const res = solve(i + k, next_j_after, j_end, inputLine, pattern, captures);
        if (res) return res;
      }
      return null;
    } else {
      const next_j_after = j + 2;
      if (matchCount >= 1) {
        const tryConsume = solve(i + 1, next_j_after, j_end, inputLine, pattern, captures);
        if (tryConsume) return tryConsume;
      }
      return solve(i, next_j_after, j_end, inputLine, pattern, captures);
    }
  }

  // Default: literal single char
  if (i < inputLine.length && pattern[j] === inputLine[i]) {
    return solve(i + 1, j + 1, j_end, inputLine, pattern, captures);
  }

  return null;
};

function findMatches(line, pattern) {
  const hasStartAnchor = pattern.length > 0 && pattern[0] === '^' && isUnescaped(pattern, 0);
  const lastIndex = pattern.length - 1;
  const hasEndAnchor = pattern.length > 0 && pattern[lastIndex] === '$' && isUnescaped(pattern, lastIndex);

  groupInfo = preParseGroups(pattern);
  log('Pre-parsed group info:', groupInfo);

  const j_start_pattern = hasStartAnchor ? 1 : 0;
  const j_end_pattern = hasEndAnchor ? pattern.length - 1 : pattern.length;

  const allMatches = [];

  let i = 0;
  while (i <= line.length) {
    if (hasStartAnchor && i > 0) break;

    let res = solve(i, j_start_pattern, j_end_pattern, line, pattern, []);
    if (hasEndAnchor && res && res.pos !== line.length) res = null;

    if (res) {
      if (res.pos === i) {
        if (i === line.length) break;
        i++;
      } else {
        allMatches.push({ start: i, end: res.pos, match: line.slice(i, res.pos) });
        i = res.pos;
      }
    } else {
      i++;
    }
  }
  return allMatches;
}

main();
