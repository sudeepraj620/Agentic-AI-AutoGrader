// Demo submissions + test cases. Each one exercises a different path through
// the grader (pass / partial / timeout cap / compile cap / crash / memory bug / copy).
const SUM_TESTS = [
  { name: "small", input: "2 3\n", expected: "5\n" },
  { name: "mixed", input: "10 -3\n", expected: "7\n" },
  { name: "large", input: "1000 2000\n", expected: "3000\n" },
];

export const CORRECT = String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    if (scanf("%d %d", &a, &b) != 2) return 1;
    printf("%d\n", a + b);
    return 0;
}
`;

export const SAMPLES = [
  { id: "correct", label: "Correct", note: "Passes every case.", source: CORRECT, tests: SUM_TESTS, references: [] },
  {
    id: "wrong", label: "Wrong answer", note: "Multiplies instead of adding — passes only by coincidence on 2·2.",
    source: String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\n", a * b);
    return 0;
}
`,
    tests: [{ name: "coincidence", input: "2 2\n", expected: "4\n" }, ...SUM_TESTS], references: [],
  },
  {
    id: "loop", label: "Infinite loop", note: "Every case times out → runtime-failure cap (20).",
    source: String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    while (1) { }
    printf("%d\n", a + b);
    return 0;
}
`,
    tests: SUM_TESTS, references: [],
  },
  {
    id: "crash", label: "Crash", note: "Null-pointer write → SIGSEGV on every case → runtime-failure cap.",
    source: String.raw`#include <stdio.h>

int main(void) {
    int a, b;
    int *p = NULL;
    scanf("%d %d", &a, &b);
    *p = a + b;
    printf("%d\n", *p);
    return 0;
}
`,
    tests: SUM_TESTS, references: [],
  },
  {
    id: "compile", label: "Compile error", note: "Missing semicolon → compile-failure cap (0).",
    source: String.raw`#include <stdio.h>

int main(void) {
    int a, b
    scanf("%d %d", &a, &b);
    printf("%d\n", a + b);
    return 0;
}
`,
    tests: SUM_TESTS, references: [],
  },
  {
    id: "heap", label: "Hidden memory bug", note: "Right answers, but writes past a heap buffer. Enable memory_safety to catch it.",
    source: String.raw`#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int a, b;
    int *buf = malloc(2 * sizeof(int));
    scanf("%d %d", &a, &b);
    buf[0] = a; buf[1] = b; buf[2] = a + b;   /* out of bounds */
    printf("%d\n", buf[2]);
    free(buf);
    return 0;
}
`,
    tests: SUM_TESTS, references: [],
  },
  {
    id: "copy", label: "Copied (renamed)", note: "Same program with renamed variables — flagged against the reference.",
    source: String.raw`#include <stdio.h>

int main(void) {
    int first, second;
    if (scanf("%d %d", &first, &second) != 2) return 1;
    printf("%d\n", first + second);
    return 0;
}
`,
    tests: SUM_TESTS, references: [CORRECT],
  },
];
