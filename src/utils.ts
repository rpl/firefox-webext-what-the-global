interface IMetadata {
  browser: boolean,
  toolkit: boolean,
  mobile: boolean,
  parent: boolean,
  child: boolean,
}

interface IGlobal {
  filepath: string,
  kind: "const" | "var" | "let" | "function" | "globalThisAssignment",
  jscode: string,
  metadata: IMetadata,
}

export interface IGlobalsMap {
  [k: string]: IGlobal[],
}

export async function fetchDataDump() {
  const data = await fetch(
    `${process.env.PUBLIC_URL}/latest-dump.json`
  ).then(res => res.json());

  return data as IGlobalsMap;
}
