/**
 * languages.js
 * ------------
 * Every language the sandbox can run.
 *
 *   image    - Docker image used for the run (pre-pull with `npm run pull-images`)
 *   build    - (optional) folder under server/ with a Dockerfile; the image is BUILT
 *              locally instead of pulled (used for Go's pre-compiled std library)
 *   memory   - (optional) memory limit for this language, overrides RUN_MEMORY
 *   file     - name the code is written to inside the container's /tmp
 *   run      - shell command that compiles (if needed) and runs that file
 *   template - starter code placed in a brand-new room / after switching language
 *
 * To add a language: add an entry here. The client gets this list from
 * GET /api/languages, so nothing else needs to change.
 */
const languages = {
  javascript: {
    label: 'JavaScript (Node 20)',
    image: 'node:20-alpine',
    file: 'main.js',
    run: 'node /tmp/main.js',
    template: `// Welcome! Share this room's URL with a friend and edit together.
// Press "Run" to execute this code in a sandboxed Docker container.

// Read everything typed in the "stdin" box (empty string if nothing was typed)
const input = require('fs').readFileSync(0, 'utf8');
const name = input.split('\\n')[0].trim() || 'world';

function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet(name));
for (let i = 1; i <= 3; i++) console.log('tick', i);
`,
  },
  python: {
    label: 'Python 3.12',
    image: 'python:3.12-alpine',
    file: 'main.py',
    run: 'python3 -u /tmp/main.py',
    template: `# Press "Run" to execute in a sandboxed Docker container.
import sys

name = sys.stdin.readline().strip() or "world"
print(f"Hello, {name}!")
for i in range(1, 4):
    print("tick", i)
`,
  },
  cpp: {
    label: 'C++ (GCC 13)',
    image: 'gcc:13',
    file: 'main.cpp',
    run: 'g++ -O2 -std=c++17 -o /tmp/main /tmp/main.cpp && /tmp/main',
    template: `#include <iostream>
#include <string>

int main() {
    std::string name;
    if (!std::getline(std::cin, name) || name.empty()) name = "world";
    std::cout << "Hello, " << name << "!" << std::endl;
    for (int i = 1; i <= 3; ++i) std::cout << "tick " << i << std::endl;
    return 0;
}
`,
  },
  java: {
    label: 'Java 21',
    image: 'eclipse-temurin:21-jdk-alpine',
    memory: '256m', // the JVM + in-memory compiler is slow/unstable at 128m
    file: 'Main.java',
    // Single-file source launcher (Java 11+): compiles in memory and runs, no javac step.
    // Flags: small/fast JVM start-up; -XX:-UsePerfData avoids writing hsperfdata files.
    run: 'java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:-UsePerfData -Xss512k /tmp/Main.java',
    template: `import java.util.Scanner;

// Press "Run" to execute in a sandboxed Docker container.
public class Main {
    public static void main(String[] args) {
        // Read the first line of the shared stdin box
        Scanner in = new Scanner(System.in);
        String name = in.hasNextLine() ? in.nextLine().trim() : "";
        if (name.isEmpty()) name = "world";

        System.out.println("Hello, " + name + "!");
        for (int i = 1; i <= 3; i++) System.out.println("tick " + i);
    }
}
`,
  },
  go: {
    label: 'Go 1.22',
    // Custom image = golang:1.22-alpine + a pre-compiled standard library.
    // Without it every run recompiles fmt/runtime/... (~25 s). See sandbox-images/go/Dockerfile.
    image: 'codesync-go:1.22',
    build: 'sandbox-images/go', // built (not pulled) by `npm run pull-images`
    memory: '256m',
    file: 'main.go',
    run: 'go run /tmp/main.go',
    template: `package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// Press "Run" to execute in a sandboxed Docker container.
func main() {
	// Read the first line of the shared stdin box
	line, _ := bufio.NewReader(os.Stdin).ReadString('\\n')
	name := strings.TrimSpace(line)
	if name == "" {
		name = "world"
	}

	fmt.Printf("Hello, %s!\\n", name)
	for i := 1; i <= 3; i++ {
		fmt.Println("tick", i)
	}
}
`,
  },
  rust: {
    label: 'Rust 1.83',
    image: 'rust:1.83-alpine',
    memory: '256m', // rustc needs headroom on bigger programs (hello-world is ~1.5 s)
    file: 'main.rs',
    // --edition 2021: plain rustc defaults to the 2015 edition, which is not what people expect
    run: 'rustc --edition 2021 -O -o /tmp/main /tmp/main.rs && /tmp/main',
    template: `use std::io::{self, BufRead};

// Press "Run" to execute in a sandboxed Docker container.
fn main() {
    // Read the first line of the shared stdin box
    let mut line = String::new();
    io::stdin().lock().read_line(&mut line).unwrap_or(0);
    let name = match line.trim() {
        "" => "world",
        n => n,
    };

    println!("Hello, {name}!");
    for i in 1..=3 {
        println!("tick {i}");
    }
}
`,
  },
  ruby: {
    label: 'Ruby 3.3',
    image: 'ruby:3.3-alpine',
    file: 'main.rb',
    run: 'ruby /tmp/main.rb',
    template: `# Press "Run" to execute in a sandboxed Docker container.

# Read the first line of the shared stdin box
name = (STDIN.gets || "").strip
name = "world" if name.empty?

puts "Hello, #{name}!"
(1..3).each { |i| puts "tick #{i}" }
`,
  },
};

const DEFAULT_LANGUAGE = 'javascript';

module.exports = { languages, DEFAULT_LANGUAGE };
