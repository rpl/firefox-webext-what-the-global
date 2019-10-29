const fs = require("fs");
const path = require("path");
const {promisify} = require("util");

const generate = require("@babel/generator").default;
const {parse} = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const shell = require("shelljs");
const yaml = require('js-yaml');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

async function collectAPIModuleGlobalsFromFile({
  basepath,
  filepath,
  metadata,
  trackDetectedGlobal,
}) {
  const relpath = path.relative(basepath, filepath);
  console.error("Parsing file path", relpath);
  const data = await readFile(filepath, {encoding: "utf-8"});

  const ast = parse(data);

  return traverse(ast, {
    VariableDeclaration: {
      exit(path) {
        if (path.parent.type !== "Program") {
          return;
        }
        const {kind} = path.node;
        const jscode = generate(path.node, {comments: false}).code;

        path.traverse({
          VariableDeclarator(subpath) {
            if (subpath.parent !== path.node) {
              return;
            }
            if (subpath.node.id.type === "Identifier") {
              console.error("\tdetected global:", kind, subpath.node.id.name);
              trackDetectedGlobal({
                kind,
                name: subpath.node.id.name,
                filepath: relpath,
                jscode,
                metadata,
              });
              return;
            } else if (subpath.node.id.type === "ObjectPattern") {
              subpath.traverse({
                ObjectProperty(propPath) {
                  let {node} = propPath;

                  let name = node.key.name;

                  // TODO: this should actually also deal with nested object patterns.
                  if (node.value && node.value.type === "Identifier") {
                    name = node.value.name;
                  }

                  console.error("\tdetected global:", kind, node.key.name);
                  trackDetectedGlobal({
                    kind,
                    name,
                    filepath: relpath,
                    jscode,
                    metadata,
                  });
                },
              });
            } else {
              console.error("CANARY unknown kind of global variable declaration:", JSON.stringify(subpath.node.id, null, 2));
              process.exit(1);
            }
          },
        });
      },
    },
    FunctionDeclaration: {
      exit(path) {
        if (path.parent.type !== "Program") {
          return;
        }
        console.error("\tdetected global:", "function", path.node.id.name);
        trackDetectedGlobal({
          kind: "function",
          name: path.node.id.name,
          filepath: relpath,
          metadata,
          jscode: generate(path.node, {comments: false}).code,
        });
      },
    },
    AssignmentExpression: {
      exit(path) {
        if (path.scope.block.type !== "Program") {
          return;
        }
        path.traverse({
          MemberExpression(exprPath) {
            if (exprPath.node.object.type !== "ThisExpression" || exprPath.scope.block.type !== "Program") {
              return;
            }
            console.error("\tdetected global:", `this.${exprPath.node.property.name}`);
            trackDetectedGlobal({
              kind: "globalThisAssignment",
              name: exprPath.node.property.name,
              filepath: relpath,
              metadata,
              jscode: generate(path.node, {comments: false}).code,
            });
          }
        });
      }
    },
  });
}

async function collectAPIModulesGlobals({basepath}) {
  const groups = {
    parent: {
      toolkit: "toolkit/components/extensions/parent/ext-*.js",
      browser: "browser/components/extensions/parent/ext-*.js",
    },
    child: {
      toolkit: "toolkit/components/extensions/child/ext-*.js",
      browser: "browser/components/extensions/child/ext-*.js",
    },
    mobile: {
      toolkit: "toolkit/components/extensions/*/ext-*.js",
      mobile: "mobile/android/components/extensions/ext-*.js",
    }
  };

  const visited = new Set();
  const detectedGlobals = new Map();

  function trackDetectedGlobal({
    name, filepath, kind, jscode, metadata
  }) {
    if (!detectedGlobals.has(name)) {
      detectedGlobals.set(name, []);
    }

    detectedGlobals.get(name).push({filepath, kind, metadata, jscode});
  }

  const promises = [];
  for (const group of Reflect.ownKeys(groups)) {
    for (const subgroup of Reflect.ownKeys(groups[group])) {
      const abspath = path.join(basepath, groups[group][subgroup]);
      const modpaths = shell.ls(abspath);

      for (const filepath of modpaths) {
        if (visited.has(filepath)) {
          continue;
        }
        visited.add(filepath);
        promises.push(collectAPIModuleGlobalsFromFile({
          trackDetectedGlobal,
          filepath, 
          basepath,
          metadata: {
            toolkit: subgroup === "toolkit",
            browser: subgroup === "browser",
            mobile: subgroup === "mobile",
            parent: group === "parent",
            child: group === "child",
          },
        }));
      }
    }
  }

  await Promise.all(promises);

  return detectedGlobals;
}

function printFilteredGlobals(globalsMap) {
  const skipRegExps = [
    /\.jsm"\);$/,
    /ExtensionParent;$/,
    /ExtensionCommon;$/,
    /ExtensionUtils;$/,
  ];
  for (const [k, v] of globalsMap.entries()) {
    if (v.length < 2) {
      continue;
    }

    let shouldSkip = !!skipRegExps.find((el) => v.every(i => el.test(i.jscode)));
    if (shouldSkip) {
      continue;
    }
    console.log(`${k}:\n${yaml.dump(v)}`);
  }
}

const basepath = process.argv[2] || path.join("..", "mozilla-central");
const outpath = process.argv[3] || path.join("public", "latest-dump.json");

collectAPIModulesGlobals({basepath}).then(
  async detectedGlobals => {
    // printFilteredGlobals(detectedGlobals);
    const data = {};
    for (const [k, v] of detectedGlobals.entries()) {
      data[k] = v;
    }
    await writeFile(outpath, JSON.stringify(data));
  },
  console.error
);
