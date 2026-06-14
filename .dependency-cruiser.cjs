module.exports = {
  forbidden: [
    {
      name: "no-cross-coworker-internals",
      comment: "Ein Coworker-Modul darf nicht in die Interna eines anderen greifen.",
      severity: "error",
      from: { path: "^src/coworkers/([^/]+)/" },
      to: {
        path: "^src/coworkers/([^/]+)/",
        pathNot: [
          "^src/coworkers/$1/",
          "^src/coworkers/(types|registry|resolve|guard|merge|env|validate)",
        ],
      },
    },
  ],
  options: { tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } },
};
