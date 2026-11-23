export const suggestion = (baseSha: string) =>
  ({
    kind: "local-command-suggestion",
    config: {
      version: 1,
      commands: {
        setup: { argv: ["npm", "ci"] },
        test: { argv: ["npm", "test"] },
      },
    },
    source: {
      baseSha,
      rule: "npm",
      version: 1,
      inputs: ["package.json", "package-lock.json"],
    },
    approvalCandidate: {
      identity: "e".repeat(64),
      policyVersion: "argent-npm-suggestion-v1",
    },
  }) as const;
