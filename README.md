# 🔍 Custom Grep & Regex Engine

A production-ready implementation of the Unix `grep` utility with a custom regex engine built from scratch in JavaScript. This project demonstrates advanced pattern matching using recursive backtracking algorithms without relying on built-in regex libraries.

![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D14-success)

## Overview

This is a complete grep clone that implements its own regex engine using recursive backtracking. Unlike typical implementations that wrap native regex libraries, this project builds the pattern matching logic from the ground up, providing deep insight into how text search and regular expressions work at a fundamental level.

## Key Features

### Regex Pattern Support
- **Literals**: Exact character matching (`cat`, `hello`)
- **Wildcards**: `.` matches any single character
- **Character Classes**: 
  - Positive classes: `[abc]`, `[a-z]`, `[0-9]`
  - Negated classes: `[^abc]`
  - Shorthand classes: `\d` (digits), `\w` (word chars), `\s` (whitespace)
- **Anchors**: 
  - `^` or `\A` for start of line
  - `$` or `\z` for end of line
- **Quantifiers** (greedy with backtracking):
  - `?` (zero or one)
  - `*` (zero or more)
  - `+` (one or more)
  - `{n,m}` (range: n to m occurrences)
  - `{n}` (exactly n occurrences)
- **Alternation**: `(cat|dog)` matches either pattern
- **Capture Groups**: `(...)` with backreferences `\1`, `\2`, etc.
- **Nested Groups**: Full support for complex nested patterns

### Command-Line Features
| Flag | Description |
|------|-------------|
| `-E <pattern>` | Specify the regex pattern to search for |
| `-i`, `--ignore-case` | Case-insensitive matching |
| `-v`, `--invert-match` | Show lines that don't match |
| `-n`, `--line-number` | Display line numbers |
| `-r` | Recursively search directories |
| `-o` | Print only the matched parts |
| `-C <N>`, `--context <N>` | Show N lines of context around matches |
| `--color=always\|auto\|never` | Colorize match highlighting |

## Architecture

The system is built in three layers:

### 1. CLI Layer (Input/Output)
Handles command-line argument parsing, file I/O, directory traversal, and output formatting. Manages flags, reads from files or stdin, and formats results with colors and line numbers.

### 2. Pattern Preprocessing Layer
Before matching begins, the pattern is analyzed to identify group boundaries and structure. The `preParseGroups()` function creates a map of opening and closing parentheses, enabling efficient navigation during recursion.

### 3. Regex Engine (Core Matching)
The heart of the system is the `solve()` function, which uses recursive backtracking to match patterns:

```javascript
solve(i, j_start, j_end, inputLine, pattern, captures)
```

- `i`: Current position in input text
- `j_start`, `j_end`: Current pattern slice being matched
- `captures`: Array storing captured group values

The engine recursively breaks down patterns into components (alternations, groups, character classes, literals) and attempts to match each piece. When a path fails, it backtracks and tries alternative paths.

## How It Works

### Recursive Backtracking Algorithm

1. **Base Case**: If pattern is fully consumed, return success
2. **Alternation**: Split on `|` and try each alternative
3. **Character Classes**: Check if current char matches the class
4. **Groups**: Recursively match group content, store captures
5. **Quantifiers**: Greedily match maximum repetitions, backtrack on failure
6. **Literals**: Direct character comparison
7. **Backtrack**: If match fails, try fewer repetitions or alternative paths

### Example: Matching `a.*b` against `axxxb`

```
1. Match 'a' → success, advance
2. Match '.*' → greedily consume 'xxxb' (all remaining)
3. Try to match 'b' → fail (end of string)
4. Backtrack: '.*' gives up one char → now matches 'xxx'
5. Try to match 'b' → success!
```

## Installation & Usage

### Prerequisites
- Node.js v14 or higher

### Setup
```bash
git clone <repository-url>
cd codecrafters-grep-javascript
chmod +x your_program.sh
```

### Basic Usage

Search for a pattern in a file:
```bash
./your_program.sh -E "pattern" file.txt
```

Case-insensitive search with line numbers:
```bash
./your_program.sh -E -i -n "error" app.log
```

Recursive directory search:
```bash
./your_program.sh -r -E "\d{3}-\d{4}" ./src
```

Search from stdin:
```bash
echo "test123" | ./your_program.sh -E "\d+"
```

Complex pattern with groups and backreferences:
```bash
./your_program.sh -E "(cat|dog)\1" file.txt  # Matches "catcat" or "dogdog"
```

## Project Structure

```
.
├── app/
│   └── main.js              # Complete implementation
├── .codecrafters/
│   ├── compile.sh           # Build script
│   └── run.sh               # Execution wrapper
├── your_program.sh          # Entry point script
├── package.json             # Project metadata
├── codecrafters.yml         # CodeCrafters configuration
├── README.md                # This file
└── PROJECT_PLAN.md          # Detailed technical documentation
```

## Technical Highlights

- **Zero Dependencies**: Pure JavaScript implementation
- **Greedy Quantifiers**: Implements standard regex greedy matching with backtracking
- **Capture Groups**: Full support for nested groups and backreferences
- **Range Quantifiers**: Supports `{n,m}` syntax for all pattern types
- **Context Display**: Shows surrounding lines like GNU grep
- **Color Output**: ANSI color codes for match highlighting

## Use Cases

- Learning regex engine internals
- Understanding recursive algorithms and backtracking
- Text processing and log analysis
- Pattern matching in build tools
- Educational demonstrations of compiler/interpreter concepts

## Performance Considerations

This engine uses recursive backtracking, which can have exponential time complexity in worst-case scenarios (e.g., `(a+)+b` against `aaaa...c`). For production use with untrusted patterns, consider:
- Implementing memoization to cache subproblem results
- Adding recursion depth limits
- Using iterative NFA/DFA compilation for linear-time guarantees

## Educational Value

Building this project teaches:
- **Recursion**: Managing complex nested state across function calls
- **Backtracking**: Exploring solution spaces and undoing failed attempts
- **Parsing**: Interpreting formal grammars and syntax
- **State Management**: Tracking captures and positions through recursion
- **Algorithm Design**: Balancing correctness with performance

## License

MIT License - see package.json for details

## Acknowledgments

Built as part of the CodeCrafters "Build Your Own Grep" challenge
