import { spawn, ChildProcess, SpawnOptions } from "child_process";
import { EventEmitter } from "events";
import { Client, ExecOptions, PseudoTtyOptions, X11Options, ClientChannel, ConnectConfig } from "ssh2";
import { ReadStream } from "fs";
import { Readable, Writable } from "stream";

export  { PseudoTtyOptions, X11Options, ConnectConfig } from "ssh2"

export interface RunOptions extends SpawnOptions { // ExecOptions
    /** Set to `true` to allocate a pseudo-tty with defaults, or an object containing specific pseudo-tty settings. */
    pty?: true | PseudoTtyOptions;
    /** Set either to `true` to use defaults, a number to specify a specific screen number, or an object containing x11 settings. */
    x11?: boolean | number | X11Options;
}

export interface Process extends EventEmitter {
    on(event: "out" | "err", callback: (this: Process, line: string) => void): this;
    on(event: "close", callback: (this: Process, code: number, signal: string) => void): this;
    stdin: Writable;
    executor: Executor;
}

export interface Executor {
    execute(command: string, params: string[], runOptions?: RunOptions): Process;
    collect(command: string, params: string[], runOptions?: RunOptions): Promise< ProcessResult >;
    close(): void;
}

export interface ProcessResult {
    signal ?: string;
    code: number;
    out: string[];
    err: string[];
}

class ProcessImpl extends EventEmitter implements Process {
    constructor(public executor: Executor) {
        super();
    }
    public stdin: Writable = undefined as any;
}

class ExecutorImpl implements Executor {
    constructor(
        private executeFunction: (this: Executor, command: string, params: string[], runOptions?: RunOptions) => Process,
        private closeFunction: (this: Executor) => void = () => {},
    ){}

    public execute(command: string, params: string[], runOptions?: RunOptions): Process {
        return this.executeFunction.call(this, command, params, runOptions);
    }

    public close(): void {
        this.closeFunction.call(this);
    }

    public collect(command: string, params: string[], runOptions?: RunOptions): Promise< ProcessResult > {
        return new Promise((res, rej) => {
            const process: Process = this.execute(command, params, runOptions);
            const outBuffer: string[] = [];
            const errBuffer: string[] = [];
            process.on("out", (line) => outBuffer.push(line));
            process.on("err", (line) => errBuffer.push(line));
            process.on("close", (code, signal) => {
                const result: ProcessResult = {
                    code,
                    signal,
                    err: errBuffer,
                    out: outBuffer,
                };
                if(code != 0) {
                    rej(result);
                } else {
                    res(result);
                }
            });
        });
    }
}

export function executor(remoteConnectionConfig ?: ConnectConfig): Promise<Executor> {
    return new Promise((res, rej) => {
        if(remoteConnectionConfig) {
            const client = new Client();
            client.on("ready", () => {
                res(new ExecutorImpl(function (command: string, params: string[], runOptions?: RunOptions): Process {
                    const emitter: Process = new ProcessImpl(this);
                    const options: RunOptions = runOptions || {};
                    const fullCommand = command + (params.length != 0 ? " " + params.join(" ") : "");
                    function doCommand() {
                        if(!client.exec(fullCommand, {
                            env: options.env,
                            pty: options.pty,
                            x11: options.x11,
                        }, (err: Error, channel: ClientChannel) => {
                            channel.on('exit', (code, signal) => {
                                emitter.emit("close", code, signal);
                            })
                            .on('data', buffer(emitter, "out"))
                            .stderr.on('data', buffer(emitter, "err"));
                            emitter.stdin = channel.stdin;
                        })){
                            setTimeout(doCommand, 100);
                        }
                    }
                    doCommand();
                    return emitter;
                }, () => client.end()));
            });
            client.connect(remoteConnectionConfig);
        } else {
            res(new ExecutorImpl(function (command: string, params: string[], runOptions?: RunOptions): Process {
                const emitter: Process = new ProcessImpl(this);
                const options: RunOptions = runOptions || {};
                const process = spawn(command, params, options);
                process.stdout.on('data', buffer(emitter, "out"));
                process.stderr.on('data', buffer(emitter, "err"));
                process.on("error", (err: Error) => {
                    emitter.emit("error", err);
                });
                process.on('close', (code, signal) => {
                    emitter.emit("close", code, signal);
                });
                emitter.stdin = process.stdin;
                return emitter;
            }));
        }
    });
}

function buffer(emitter: EventEmitter, event: string): (chunk: string | Buffer) => void {
    let buffer: string = "";
    return (data) => {
        buffer += data.toString();
        if (buffer.endsWith("\n")) {
            const data = buffer.split("\n");
            buffer = "";
            for(let i=0; i<data.length-1; i++) {
                emitter.emit(event, data[i]);
            }
        }
    };
}
