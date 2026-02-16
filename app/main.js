const fs = require("fs");
const path = require("path");

const DEBUG = false;

const log = (...args) => { if (DEBUG) console.error("DEBUG:", ...args); };

let searchOptions = { ignoreCase: false };

function main() {
  const args = process.argv.slice(2);
  let printOnly = false;
  let pattern = "";
  let useColor = false;
  let recursive = false;
  let filePaths = [];
  let ignoreCase = false;
  let showLineNumber = false;
  let invertMatch = false;
  let contextLines = 0;

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
    } else if (arg === "-i" || arg === "--ignore-case") {
      ignoreCase = true;
    } else if (arg === "-n" || arg === "--line-number") {
      showLineNumber = true;
    } else if (arg === "-v" || arg === "--invert-match") {
      invertMatch = true;
    } else if (arg === "-C" || arg === "--context") {
      if (i + 1 < args.length) {
        const val = parseInt(args[i + 1]);
        if (!isNaN(val)) {
          contextLines = val;
          i++;
        }
      }
    } else if (arg.startsWith("-C") && arg.length > 2) {
      const val = parseInt(arg.slice(2));
      if (!isNaN(val)) contextLines = val;
    } else if (arg === "-E") {
      pattern = args[i + 1];
      i++;
    } else {
      if (!arg.startsWith("-")) {
        filePaths.push(arg);
      }
    }
  }

  // Update global search options
  searchOptions.ignoreCase = ignoreCase;

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
      for (let k = 0; k < lines.length; k++) {
        let line = lines[k];
        if (line.endsWith('\r')) line = line.slice(0, -1);
        inputLines.push({ text: line, source: "(standard input)", lineNumber: k + 1 });
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
        for (let k = 0; k < lines.length; k++) {
          let line = lines[k];
          if (line.endsWith('\r')) line = line.slice(0, -1);
          inputLines.push({ text: line, source: p, lineNumber: k + 1 });
        }
      } catch (e) { console.error(e.message); }
    }
  }

  let anyMatch = false;
  const showSource = (filePaths.length > 0 && recursive) || (filePaths.length > 1);

  let lastPrintedLine = -1;

  for (let lineIdx = 0; lineIdx < inputLines.length; lineIdx++) {
    const { text: line, source } = inputLines[lineIdx];
    const matches = findMatches(line, pattern);
    const hasMatch = matches.length > 0;
    const isSelected = invertMatch ? !hasMatch : hasMatch;

    if (isSelected) {
      anyMatch = true;

      const printLine = (idx, sep) => {
        if (idx <= lastPrintedLine) return;
        lastPrintedLine = idx;

        const currentLineObj = inputLines[idx];
        const lineContent = currentLineObj.text;

        // Prepare highlight for the matching line if needed
        let output = lineContent;
        const isTargetLine = (idx === lineIdx);

        // Highlight only the target line, and only if we are not in invert mode (invert usually doesn't highlight)
        // And useColor is enabled
        if (isTargetLine && !invertMatch && useColor && matches.length > 0) {
          let parts = [];
          let lastIndex = 0;
          for (const m of matches) {
            if (m.start >= lastIndex) {
              parts.push(lineContent.slice(lastIndex, m.start));
              parts.push(`\x1b[1;31m${m.match}\x1b[0m`);
              lastIndex = m.end;
            }
          }
          parts.push(lineContent.slice(lastIndex));
          output = parts.join("");
        }

        let prefix = "";
        if (showSource) prefix += `${currentLineObj.source}${sep}`;
        if (showLineNumber) prefix += `${currentLineObj.lineNumber}${sep}`;

        console.log(`${prefix}${output}`);
      };

      if (printOnly && !invertMatch) {
        for (const m of matches) {
          let prefix = "";
          if (showSource) prefix += `${source}:`;
          if (showLineNumber) prefix += `${inputLines[lineIdx].lineNumber}:`;
          console.log(`${prefix}${m.match}`);
        }
      } else {
        const startCtx = Math.max(0, lineIdx - contextLines);

        if (contextLines > 0 && lastPrintedLine !== -1 && startCtx > lastPrintedLine + 1) {
          const prevSource = inputLines[lastPrintedLine].source;
          if (prevSource === source) {
            console.log("--");
          }
        }

        for (let k = startCtx; k < lineIdx; k++) {
          if (inputLines[k].source !== source) continue;
          printLine(k, '-');
        }

        printLine(lineIdx, ':');

        const endCtx = Math.min(inputLines.length - 1, lineIdx + contextLines);
        for (let k = lineIdx + 1; k <= endCtx; k++) {
          if (inputLines[k].source !== source) break;
          printLine(k, '-');
        }
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

const charsMatch = (c1, c2) => {
  if (searchOptions.ignoreCase) {
    return c1.toLowerCase() === c2.toLowerCase();
  }
  return c1 === c2;
};

const stringsMatch = (s1, s2) => {
  if (searchOptions.ignoreCase) {
    return s1.toLowerCase() === s2.toLowerCase();
  }
  return s1 === s2;
};

const expandRanges = (str) => {
  let expanded = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\') {
      if (i + 1 < str.length) {
        const esc = str[i + 1];
        if (esc === 'd') { expanded += "0123456789"; i += 2; continue; }
        if (esc === 'w') { expanded += "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"; i += 2; continue; }
        if (esc === 's') { expanded += " \t\n\r\f\v"; i += 2; continue; }
        expanded += esc; // literal escape
        i += 2;
        continue;
      } else {
        expanded += '\\';
        i++;
        continue;
      }
    }

    // Check for range
    if (i + 2 < str.length && str[i + 1] === '-') {
      const start = str.charCodeAt(i);
      let endChar = str.charCodeAt(i + 2);
      let jump = 3;

      if (str[i + 2] === '\\') {
        endChar = str.charCodeAt(i + 3);
        jump = 4;
      }

      if (start <= endChar) {
        for (let c = start; c <= endChar; c++) {
          expanded += String.fromCharCode(c);
        }
        i += jump;
        continue;
      }
    }

    expanded += str[i];
    i++;
  }
  return expanded;
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
    const hasStar = quant === '*';
    const hasBrace = quant === '{';

    let str = pattern.slice(j + 1, endBracket);
    const isNegated = str[0] === '^';
    if (isNegated) str = str.slice(1);

    // Proper splitting needs handling of escaped brackets inside?
    // Current parser assumes first ] closes it.

    str = expandRanges(str);
    if (searchOptions.ignoreCase) str = str.toLowerCase();

    const check = (char) => {
      if (searchOptions.ignoreCase) char = char.toLowerCase();
      return isNegated ? !str.includes(char) : str.includes(char);
    };

    // Handle {n,m} for character class
    if (hasBrace) {
      let closeBrace = pattern.indexOf('}', endBracket + 1);
      if (closeBrace !== -1) {
        const rangeStr = pattern.slice(endBracket + 2, closeBrace);
        let min, max;
        if (rangeStr.includes(',')) {
          const parts = rangeStr.split(',');
          min = parseInt(parts[0]);
          max = parts[1] === '' ? Infinity : parseInt(parts[1]);
        } else {
          min = max = parseInt(rangeStr);
        }

        const next_j = closeBrace + 1;

        // Count how many characters match the class
        let matchCount = 0;
        while (i + matchCount < inputLine.length && check(inputLine[i + matchCount])) {
          matchCount++;
        }

        if (matchCount < min) return null;

        const actualMax = Math.min(matchCount, max);
        for (let k = actualMax; k >= min; k--) {
          const res = solve(i + k, next_j, j_end, inputLine, pattern, captures);
          if (res) return res;
        }
        return null;
      }
    }

    const next_j = endBracket + (hasPlus || hasQuestion || hasStar ? 2 : 1);

    if (hasPlus || hasStar) {
      // '+' or '*' handling
      let matchCount = 0;
      while (i + matchCount < inputLine.length && check(inputLine[i + matchCount])) {
        matchCount++;
      }

      const minRequired = hasPlus ? 1 : 0;
      if (matchCount < minRequired) return null;

      log(`Greedy '${hasPlus ? '+' : '*'}' found ${matchCount} possible matches (char class).`);
      // Try all lengths from max down to minRequired
      for (let k = matchCount; k >= minRequired; k--) {
        log(`Trying '${hasPlus ? '+' : '*'}' match of length ${k} (char class)`);
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
    const hasStarAfterGroup = quant === '*';
    const hasBraceAfterGroup = quant === '{';

    // Handle {n,m} quantifier for groups
    if (hasBraceAfterGroup) {
      let closeBrace = pattern.indexOf('}', afterGroupIdx);
      if (closeBrace !== -1) {
        const rangeStr = pattern.slice(afterGroupIdx + 1, closeBrace);
        let min, max;
        if (rangeStr.includes(',')) {
          const parts = rangeStr.split(',');
          min = parseInt(parts[0]);
          max = parts[1] === '' ? Infinity : parseInt(parts[1]);
        } else {
          min = max = parseInt(rangeStr);
        }

        const next_j_after_group = closeBrace + 1;

        // Match the group min to max times greedily
        const posSnapshots = [];
        const capsSnapshots = [];
        let currPos = i;
        let currCaps = [...captures];

        while (posSnapshots.length < max) {
          const subRes = solve(currPos, j + 1, endParenIndex, inputLine, pattern, currCaps);
          if (!subRes) break;
          if (subRes.pos <= currPos) break; // avoid infinite loops
          currPos = subRes.pos;
          currCaps = subRes.captures;
          posSnapshots.push(currPos);
          capsSnapshots.push([...currCaps]);
        }

        // Must match at least min times
        if (posSnapshots.length < min) return null;

        // Try from max down to min (greedy with backtracking)
        for (let rep = posSnapshots.length; rep >= min; rep--) {
          const posAfterReps = posSnapshots[rep - 1];
          const capsAfterReps = capsSnapshots[rep - 1];
          const lastGroupCaptureValue = inputLine.slice(i, posAfterReps);
          const newCaps = [...capsAfterReps];
          newCaps[groupNum - 1] = lastGroupCaptureValue;
          log(`Trying group #${groupNum} with ${rep} repetitions, capture='${lastGroupCaptureValue}'`);
          const rest = solve(posAfterReps, next_j_after_group, j_end, inputLine, pattern, newCaps);
          if (rest) return rest;
        }

        return null;
      }
    }

    const next_j_after_group = endParenIndex + (hasPlusAfterGroup || hasQuestionAfterGroup || hasStarAfterGroup ? 2 : 1);

    // Non-repeated, non-optional group
    if (!hasPlusAfterGroup && !hasQuestionAfterGroup && !hasStarAfterGroup) {
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

    // Repeated group '+' or '*'
    if (hasPlusAfterGroup || hasStarAfterGroup) {
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

      const minReps = hasPlusAfterGroup ? 1 : 0;
      if (posSnapshots.length < minReps) return null;

      log(`Group at ${j} had ${posSnapshots.length} greedy matches (min ${minReps})`);

      for (let rep = posSnapshots.length; rep >= minReps; rep--) {
        const posAfterReps = rep > 0 ? posSnapshots[rep - 1] : i;
        const capsAfterReps = rep > 0 ? capsSnapshots[rep - 1] : captures;

        // For standard regex, repeated groups capture the LAST iteration's value. 
        // Our 'capsSnapshots' contains the cumulative captures state after each iteration.
        // So capsAfterReps already has the group #N updated to the value of the N-th iteration.
        // We just pass it along.

        const capsToPass = [...capsAfterReps];

        log(`Trying with ${rep} repetitions for group #${groupNum}`);
        const rest = solve(posAfterReps, next_j_after_group, j_end, inputLine, pattern, capsToPass);
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
    const hasStar = quant === '*';
    const hasBrace = quant === '{';

    // Handle {n,m} quantifier for escaped chars
    if (hasBrace && (escCh === 'd' || escCh === 'w' || escCh === 's' || (escCh >= '0' && escCh <= '9') === false)) {
      let closeBrace = pattern.indexOf('}', j + 2);
      if (closeBrace !== -1) {
        const rangeStr = pattern.slice(j + 3, closeBrace);
        let min, max;
        if (rangeStr.includes(',')) {
          const parts = rangeStr.split(',');
          min = parseInt(parts[0]);
          max = parts[1] === '' ? Infinity : parseInt(parts[1]);
        } else {
          min = max = parseInt(rangeStr);
        }

        const nextIndexAfter = closeBrace + 1;

        // Determine match function based on escaped char
        let checkChar;
        if (escCh === 'd') {
          checkChar = (ch) => /[0-9]/.test(ch);
        } else if (escCh === 'w') {
          checkChar = (ch) => isWordChar(ch);
        } else if (escCh === 's') {
          checkChar = (ch) => /\s/.test(ch);
        } else {
          // Escaped literal
          checkChar = (ch) => ch === escCh;
        }

        // Count matches
        let matchCount = 0;
        while (i + matchCount < inputLine.length && checkChar(inputLine[i + matchCount])) {
          matchCount++;
        }

        if (matchCount < min) return null;

        const actualMax = Math.min(matchCount, max);
        for (let k = actualMax; k >= min; k--) {
          const res = solve(i + k, nextIndexAfter, j_end, inputLine, pattern, captures);
          if (res) return res;
        }
        return null;
      }
    }

    const nextIndexAfter = j + (hasPlus || hasQuestion || hasStar ? 3 : 2);

    // Backreference
    if (escCh >= '1' && escCh <= '9') {
      const groupIndex = parseInt(escCh, 10) - 1;
      const groupValue = captures[groupIndex];
      if (groupValue === undefined) {
        if (hasQuestion || hasStar) return solve(i, nextIndexAfter, j_end, inputLine, pattern, captures);
        return null;
      }
      if (!hasPlus && !hasQuestion && !hasStar) {
        if (i + groupValue.length <= inputLine.length && stringsMatch(inputLine.slice(i, i + groupValue.length), groupValue)) {
          log(`Backref \\${groupIndex + 1} matched '${groupValue}'`);
          return solve(i + groupValue.length, nextIndexAfter, j_end, inputLine, pattern, captures);
        }
        return null;
      }

      let count = 0;
      let curr = i;
      while (curr + groupValue.length <= inputLine.length && stringsMatch(inputLine.slice(curr, curr + groupValue.length), groupValue)) {
        curr += groupValue.length;
        count++;
      }

      const minMatches = hasPlus ? 1 : 0;
      if (hasPlus || hasStar) {
        if (count < minMatches) return null;
        for (let k = count; k >= minMatches; k--) {
          const posTry = i + k * groupValue.length;
          const res = solve(posTry, nextIndexAfter, j_end, inputLine, pattern, captures);
          if (res) return res;
        }
        return null;
      } else { // '?'
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

      if (!hasPlus && !hasQuestion && !hasStar) {
        if (i < inputLine.length && checkChar(inputLine[i])) {
          return solve(i + 1, nextIndexAfter, j_end, inputLine, pattern, captures);
        }
        return null;
      }

      if (hasPlus || hasStar) {
        if (i >= inputLine.length && hasPlus) return null;
        let matchCount = 0;
        while (i + matchCount < inputLine.length && checkChar(inputLine[i + matchCount])) matchCount++;

        const minMatches = hasPlus ? 1 : 0;
        if (matchCount < minMatches) return null;

        log(`Escaped '${escCh}${hasPlus ? '+' : '*'}' greedy matched ${matchCount} chars.`);
        for (let k = matchCount; k >= minMatches; k--) {
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
    // Generic escaped literal
    if (!hasPlus && !hasQuestion && !hasStar) {
      const literal = escCh;
      if (i < inputLine.length && inputLine[i] === literal) {
        return solve(i + 1, nextIndexAfter, j_end, inputLine, pattern, captures);
      }
      return null;
    }

    if (hasPlus || hasStar) {
      const literal = escCh;
      let matchCount = 0;
      while (i + matchCount < inputLine.length && inputLine[i + matchCount] === literal) matchCount++;

      const minMatches = hasPlus ? 1 : 0;
      if (matchCount < minMatches) return null;

      for (let k = matchCount; k >= minMatches; k--) {
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
    const hasStar = quant === '*';
    const hasBrace = quant === '{';

    // Handle {n,m} for wildcard is done in the generic code block below? No, it's checked separately?
    // Wait, the generic {n,m} block handles '.' separately. 
    // Actually, line 534 handles {n,m} for '.' if detected. 
    // BUT we are in the '.' specific block here.
    // The previous {n,m} logic was inserted before "Literal character with quantifier".
    // Does it cover '.'? 
    // Line 512 checks "const nextPatChar... if (nextPatChar === '{')".
    // If pattern[j]==='.', then nextPatChar IS '{' if pattern is ".{2,4}".
    // So {n,m} logic runs BEFORE this block and returns or returns null.
    // So we don't need to handle {n,m} here again IF we ensure correct flow.
    // However, if {n,m} failed (returns null), we assume it didn't match and we shouldn't continue?
    // Actually the {n,m} block returns null if it FAILS to match.
    // But if it wasn't a {n,m} sequence, it skips.
    // We can assume quantifiers here are just +, ?, *.

    const next_j_after = j + (hasPlus || hasQuestion || hasStar ? 2 : 1);

    if (!hasPlus && !hasQuestion && !hasStar) {
      if (i < inputLine.length) {
        return solve(i + 1, next_j_after, j_end, inputLine, pattern, captures);
      }
      return null;
    }

    if (hasPlus || hasStar) {
      let matchCount = 0;
      if (i < inputLine.length) matchCount = inputLine.length - i; // '.' matches everything

      const minMatches = hasPlus ? 1 : 0;
      if (matchCount < minMatches) return null;

      for (let k = matchCount; k >= minMatches; k--) {
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



  // Check for {n,m} quantifier on literals, character classes, etc.
  // For escaped chars like \d, the { is at j+2, for regular chars it's at j+1
  let quantifierPos = -1;
  let elementSize = 1; // How many pattern chars does the element consume

  if (pattern[j] === '\\' && j + 1 < pattern.length && j + 2 < pattern.length && pattern[j + 2] === '{') {
    quantifierPos = j + 2;
    elementSize = 2; // backslash + escaped char
  } else if (pattern[j] !== '\\' && pattern[j] !== '(' && pattern[j] !== '[' && j + 1 < pattern.length && pattern[j + 1] === '{') {
    quantifierPos = j + 1;
    elementSize = 1;
  }

  if (quantifierPos !== -1) {
    // Parse {n,m} or {n}
    let closeBrace = pattern.indexOf('}', quantifierPos);
    if (closeBrace !== -1) {
      const rangeStr = pattern.slice(quantifierPos + 1, closeBrace);
      let min, max;
      if (rangeStr.includes(',')) {
        const parts = rangeStr.split(',');
        min = parseInt(parts[0]);
        max = parts[1] === '' ? Infinity : parseInt(parts[1]);
      } else {
        min = max = parseInt(rangeStr);
      }

      const next_j_after = closeBrace + 1;

      // What are we quantifying?
      let matchFunc;
      if (pattern[j] === '.') {
        matchFunc = (pos) => pos < inputLine.length;
      } else if (pattern[j] === '\\' && j + 1 < pattern.length) {
        const escCh = pattern[j + 1];
        if (escCh === 'd') {
          matchFunc = (pos) => pos < inputLine.length && /[0-9]/.test(inputLine[pos]);
        } else if (escCh === 'w') {
          matchFunc = (pos) => pos < inputLine.length && isWordChar(inputLine[pos]);
        } else if (escCh === 's') {
          matchFunc = (pos) => pos < inputLine.length && /\s/.test(inputLine[pos]);
        } else {
          // Escaped literal
          matchFunc = (pos) => pos < inputLine.length && charsMatch(inputLine[pos], escCh);
        }
      } else {
        // Regular literal
        const literal = pattern[j];
        matchFunc = (pos) => pos < inputLine.length && charsMatch(inputLine[pos], literal);
      }

      // Count how many times we can match
      let matchCount = 0;
      let testPos = i;
      while (matchFunc(testPos)) {
        matchCount++;
        testPos++;
      }

      // Must match at least min times
      if (matchCount < min) return null;

      // Try from max down to min (greedy with backtracking)
      const actualMax = Math.min(matchCount, max);
      for (let k = actualMax; k >= min; k--) {
        const res = solve(i + k, next_j_after, j_end, inputLine, pattern, captures);
        if (res) return res;
      }
      return null;
    }
  }

  // Literal character with quantifier
  const nextPatChar = (j + 1 < pattern.length) ? pattern[j + 1] : null;
  const literalHasPlus = nextPatChar === '+';
  const literalHasQuestion = nextPatChar === '?';
  const literalHasStar = nextPatChar === '*';

  if (literalHasPlus || literalHasQuestion || literalHasStar) {
    const literal = pattern[j];
    let matchCount = 0;
    while (i + matchCount < inputLine.length && charsMatch(inputLine[i + matchCount], literal)) matchCount++;

    if (literalHasPlus || literalHasStar) {
      const minMatches = literalHasPlus ? 1 : 0;
      if (matchCount < minMatches) return null;

      log(`Literal '${literal}${literalHasPlus ? '+' : '*'}' greedy matched ${matchCount} times.`);
      const next_j_after = j + 2;
      for (let k = matchCount; k >= minMatches; k--) {
        const res = solve(i + k, next_j_after, j_end, inputLine, pattern, captures);
        if (res) return res;
      }
      return null;
    } else {
      // '?'
      const next_j_after = j + 2;
      if (matchCount >= 1) {
        const tryConsume = solve(i + 1, next_j_after, j_end, inputLine, pattern, captures);
        if (tryConsume) return tryConsume;
      }
      return solve(i, next_j_after, j_end, inputLine, pattern, captures);
    }
  }

  // Default: literal single char
  if (i < inputLine.length && charsMatch(inputLine[i], pattern[j])) {
    return solve(i + 1, j + 1, j_end, inputLine, pattern, captures);
  }

  return null;
};

function findMatches(line, pattern) {
  let hasStartAnchor = false;
  let hasEndAnchor = false;
  let j_start_pattern = 0;
  let j_end_pattern = pattern.length;

  if (pattern.length > 0 && pattern[0] === '^' && isUnescaped(pattern, 0)) {
    hasStartAnchor = true;
    j_start_pattern = 1;
  } else if (pattern.length > 1 && pattern[0] === '\\' && pattern[1] === 'A') {
    hasStartAnchor = true;
    j_start_pattern = 2;
  }

  const lastIndex = pattern.length - 1;
  // Check for $ (end anchor)
  // Be careful not to match \$ as anchor
  if (pattern.length > 0 && pattern[lastIndex] === '$' && isUnescaped(pattern, lastIndex)) {
    hasEndAnchor = true;
    j_end_pattern = lastIndex;
  } else if (pattern.length > 1 && pattern[lastIndex] === 'z' && pattern[lastIndex - 1] === '\\' && isUnescaped(pattern, lastIndex - 1)) {
    hasEndAnchor = true;
    j_end_pattern = lastIndex - 1;
  }

  groupInfo = preParseGroups(pattern);
  log('Pre-parsed group info:', groupInfo);

  const allMatches = [];

  let i = 0;
  while (i <= line.length) {
    if (hasStartAnchor && i > 0) break;

    let res = solve(i, j_start_pattern, j_end_pattern, line, pattern, []);

    // Check end anchor match
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
