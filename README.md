# ts-child-process

Asynchronously execute child-processes on the local or a remote machine.

## Local
```ts
const process: Process = await executor().then(exec => exec.execute("npm", ["--version"], {
    shell: true,
});
```

## Remote
```ts
const process: Process = await executor({
    host: "example.com",
    username: "root",
    password: "*****",
}).then(exec => exec.execute("npm", ["--version"]);
```

## Usage
```ts
process.on("out", (txt) => console.log("OUT", txt))
  .on("err", (txt) => console.log("ERR", txt))
  .on("close", (code, sig) => console.log("CLOSE", code, sig)));
```
