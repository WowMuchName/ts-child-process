import { executor, Process, ProcessResult, Executor, ConnectConfig } from "./process";

export interface NixExecutor extends Executor {
    addUser(user: string): Promise<void>;
    cat(file: string): Promise<string>;
    chmod(file: string, code: number): Promise<void>;
    chown(file: string, user: string, group: string): Promise<void>;
    listUsers(): Promise<Set<string>>;
    mkdir(dir: string): Promise<void>;
    hostname(): Promise<string>;
    ifconfig(): Promise<Map<string, NetworkInterface>>;
    keygen(passphrase: string, destination: string, bitcount?: number): Promise<void>;
    removeUser(user: string): Promise<void>;
    remove(dir: string): Promise<void>;
}

export async function nixExecutor(conf: ConnectConfig): Promise<NixExecutor> {
    const exec: NixExecutor = await executor(conf) as any;

    exec.addUser = async function (user: string) {
        await exec.collect(["useradd", "-m", user]);
    }

    exec.cat = async function (file: string): Promise<string> {
        return (await exec.collect(["cat", file])).out.join("\n");
    }

    exec.chmod = async function (file: string, code: number) {
        await exec.collect(["chmod", "" + code, file]);
    }

    exec.chown = async function (file: string, user: string, group: string) {
        await exec.collect(["chown", "-R", user + ":" + group, file]);
    }

    exec.listUsers = async function(): Promise<Set<string>> {
        const result: ProcessResult = await exec.collect(["cut", "-d:", "-f1", "/etc/passwd"]);
        if(result.code != 0) {
            throw new Error(result.err.join(" "));
        }
        return new Set(result.out);
    }

    exec.hostname = async function(): Promise<string> {
        return (await exec.collect(["hostname"])).out[0];
    }

    exec.ifconfig = async function(): Promise<Map<string, NetworkInterface>> {
        const map: Map<string, NetworkInterface> = new Map();
        for(let part of (await exec.collect(["ifconfig"])).out.join("\n").split(/[\n]{2}/)) {
            let ni: NetworkInterface = {
                name: part.substring(0, part.indexOf(" ")).trim(),
                raw: part,
            };
            var inetExp = /inet addr\:[ ]*([^ \n]*)/g;
            var inet6Exp = /inet6 addr\:[ ]*([^ \n]*)/g;
            var bcastExp = /Bcast\:[ ]*([^ \n]*)/g;
            var maskExp = /Mask\:[ ]*([^ \n]*)/g;
    
            let match = inetExp.exec(part);
            ni.inetAddress = match ? match[1] : undefined;
            match = inet6Exp.exec(part);
            ni.inet6Address = match ? match[1] : undefined;
            match = bcastExp.exec(part);
            ni.bcastAddress = match ? match[1] : undefined;
            match = maskExp.exec(part);
            ni.mask = match ? match[1] : undefined;
            map.set(ni.name, ni);
        }
        return map;
    }

    exec.keygen = async function (passphrase: string, destination: string, bitcount: number = 4048) {
        await exec.collect(["ssh-keygen", "-b", "" + bitcount, "-N", passphrase, "-f", destination]);
    }

    exec.mkdir = async function (dir: string) {
        await exec.collect(["mkdir", dir])
    }

    exec.removeUser = async function (user: string) {
        await exec.collect(["deluser", user]);
    }

    exec.remove = async function (dir: string) {
        await exec.collect(["rm", "-rf", dir]);
    }

    return exec;
}

export interface NetworkInterface {
    name: string;
    inetAddress?: string;
    inet6Address?: string;
    bcastAddress?: string;
    mask?: string;
    raw: string;
}
