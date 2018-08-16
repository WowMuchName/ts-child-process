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
    on(event: "out" | "err", callback: (line: string) => void): this;
    on(event: "close", callback: (code: number, signal: string) => void): this;
    stdin: Writable;
}

export interface Executor {
    execute(command: string, params: string[], runOptions?: RunOptions): Process;
}

export function executor(remoteConnectionConfig ?: ConnectConfig): Promise<Executor> {
    return new Promise((res, rej) => {
        if(remoteConnectionConfig) {
            const client = new Client();
            client.on("ready", () => {
                res({
                    execute: (command: string, params: string[], runOptions?: RunOptions): Process => {
                        const emitter: Process = new EventEmitter() as Process;
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
                        return emitter as any;
                    }
                });
            });
            client.connect(remoteConnectionConfig);
        } else {
            res({
                execute: (command: string, params: string[], runOptions?: RunOptions): Process => {
                    const emitter: Process = new EventEmitter() as Process;
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
                }
            });
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
