# 🔍 Custom Grep & Regex Engine (JavaScript)

> **A from-scratch implementation of the legendary `grep` utility and a Recursive Backtracking Regex Engine.**

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D14-success)

## 📖 Introduction

This project is a deep-dive implementation of the Unix `grep` command, built entirely in JavaScript/Node.js. Unlike standard wrappers that rely on the built-in `RegExp` engine, this project implements its own **Regex Engine** from the ground up using **Recursive Backtracking**.

It was built to understand the core computer science concepts behind pattern matching, text parsing, and command-line tool architecture.

## 🏗️ Architecture & The "Basic Idea"

At its heart, this tool is composed of two main systems:

1.  ** The CLI Wrapper**: Handles file I/O, argument parsing (flags like `-n`, `-r`, `-i`), and output formatting.
2.  **The Regex Engine (`solve`)**: A recursive function that attempts to match a pattern against a string.

### The Core Concept: Recursive Backtracking

Most modern regex engines (like those in Python or Perl) use Backtracking. The basic idea is simple but powerful:

1.  **Consume**: Try to match the current character in the pattern with the current character in the string.
2.  **Recurse**: If successful, move to the next character in both and call the function again.
3.  **Backtrack**: If a path fails (e.g., a `*` matched too many characters), "undo" the last step and try a different path (e.g., match one fewer character).

#### Workflow Diagram

```merchant
graph TD
    A[Input: "a1b"] --> B(CLI Parser)
    B --> C{Pattern: "\d"}
    C --> D[Engine: solve(index=0, pattern_idx=0)]
    D -- 'a' != '\d' --> E[Fail & Advance Input]
    E --> F[solve(index=1, pattern_idx=0)]
    F -- '1' == '\d' --> G[Match Found!]
    G --> H[Print Output]
```

## ✨ Supported Features

### 🧩 Regex Capabilities
*   **Literals**: Matches exact characters (e.g., `cat`).
*   **Wildcards**: `.` matches any character.
*   **Character Classes**: 
    *   `[abc]`: Matches any of a, b, or c.
    *   `[^abc]`: Negated class (match start except a, b, c).
    *   `\d`, `\w`: Digit and Word characters.
*   **Anchors**: `^` (Start of line), `$` (End of line).
*   **Quantifiers (Greedy)**:
    *   `?`: Zero or one.
    *   `*`: Zero or more.
    *   `+`: One or more.
    *   `{n,m}`: Range repetitions (e.g., `{2,4}`).
*   **Alternation**: `(cat|dog)` matches "cat" OR "dog".
*   **Groups & Backreferences**: 
    *   Capture groups `(...)`.
    *   Refer to captured groups later with `\1`, `\2`, etc.

### 💻 CLI Flags
| Flag | Description |
| :--- | :--- |
| `-E` | Extended regex mode (default engine). |
| `-i` | Case-insensitive search. |
| `-v` | Invert match (show lines that *don't* match). |
| `-n` | Print line numbers. |
| `-r` | Sarch directories recursively. |
| `-C <N>` | Show `<N>` lines of context around matches. |
| `--color`| Highlight matches (auto/always/never). |

## 🚀 Getting Started

### Prerequisites
*   **Node.js**: v14 or higher.

### Installation
Clone the repository and ensure you have execution permissions:

```bash
git clone https://github.com/yourusername/codecrafters-grep-javascript.git
cd codecrafters-grep-javascript
chmod +x your_program.sh
```

### Usage
You can run the program using the helper script `your_program.sh` or directly via `node`.

**Basic Search:**
```bash
./your_program.sh -E "pattern" filename.txt
```

**Recursive Search with Lines:**
```bash
./your_program.sh -r -n -E "\d+" ./src
```

**Using Stdin:**
```bash
echo "hello world" | ./your_program.sh -E "hello"
```

## 📂 Project Structure

```text
.
├── app/
│   └── main.js       # THE CORE. Contains CLI logic + Regex Engine.
├── your_program.sh   # Bash wrapper to run the project.
└── README.md         # This file.
```

## 🧠 Why Build This?
Building a regex engine is one of the best ways to learn:
1.  **Recursion Depth**: Handling complex nested states.
2.  **String Parsing**: Reading and interpreting a formal grammar.
3.  **State Management**: Keeping track of capture groups across recursive calls.
