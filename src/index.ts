import * as glob from 'glob';
import { basename, dirname, resolve as resolvePath } from 'path';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { promisify } from 'util';

export interface SimpleSSHDeployConfig {
    auth: {
        host: string;
        port?: number;
        username?: string;
        password?: string;
        [key: string]: any;
    };
    localFiles?: string | string[];
    remotePath?: string;
    preDeploy?: string[];
    postDeploy?: string[];
    silent?: boolean;
}

interface DeployFilePath {
    localPath: string;
    remotePath: string;
}

let logger: (string: string) => void;

export default function simpleSSHDeploy(config: SimpleSSHDeployConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!config.localFiles && (!config.preDeploy || config.preDeploy.length === 0) && (!config.postDeploy || config.postDeploy.length === 0)) {
            reject('No files to deploy or commands to execute');
            return;
        }

        if (config.localFiles) {
            if (typeof config.localFiles !== 'string' && !Array.isArray(config.localFiles)) {
                reject('localFiles config option must be a string or an array');
                return;
            }
            if (!config.remotePath) {
                reject('remotePath config option must be specified to deploy files');
                return;
            }
        }

        if (config.preDeploy && !Array.isArray(config.preDeploy)) {
            reject('preDeploy config option must be an array');
            return;
        }

        if (config.postDeploy && !Array.isArray(config.postDeploy)) {
            reject('postDeploy config option must be an array');
            return;
        }

        if (config.silent) {
            logger = string => {};
        } else {
            logger = string => console.log(string);
        }

        const authConfig: ConnectConfig = Object.assign(
            {
                port: 22,
                tryKeyboard: true
            },
            config.auth
        );

        const sshClient: Client = new Client();
        sshClient.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
            finish([authConfig.password]);
        });

        sshClient.on('ready', async () => {
            try {
                // executing predeploy commmands
                if (config.preDeploy && config.preDeploy.length > 0) {
                    for (const command of config.preDeploy) {
                        await execCommand(sshClient, command);
                    }
                }

                // deploying files
                if (config.localFiles && config.remotePath) {
                    const filePaths: DeployFilePath[] = await resolveFilePaths(config.localFiles, config.remotePath);
                    if (filePaths.length > 0) {
                        await copyFiles(sshClient, filePaths);
                    }
                }

                // executing postdeploy commands
                if (config.postDeploy && config.postDeploy.length > 0) {
                    for (const command of config.postDeploy) {
                        await execCommand(sshClient, command);
                    }
                }
            } catch (error) {
                reject(error);
                return;
            } finally {
                sshClient.end();
            }
            resolve();
        });

        sshClient.on('error', error => {
            reject(error);
        });

        sshClient.connect(authConfig);
    });
}

function execCommand(sshClient: Client, command: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let errorData: string = '';
        sshClient.exec(command, (error, stream) => {
            if (error) {
                reject(error);
                return;
            }

            stream.on('close', () => {
                if (errorData !== '') {
                    reject(errorData);
                } else {
                    resolve();
                }
            });

            stream.on('data', (data: Buffer) => logger(data.toString()));

            stream.stderr.on('data', (data: Buffer) => (errorData += data));
        });
    });
}

let copyFile: (localPath: string, remotePath: string, callback: (error: any) => void) => Promise<void>;
let openDir: (path: string, callback: (error: any, handle: Buffer) => void) => Promise<boolean>;
let makeDir: (path: string, callback: (error: any) => void) => Promise<boolean>;

function copyFiles(sshClient: Client, filePaths: DeployFilePath[]): Promise<void> {
    return new Promise((resolve, reject) => {
        sshClient.sftp(async (error, sftp) => {
            if (error) {
                reject(error);
            } else {
                copyFile = promisify(sftp.fastPut);
                openDir = promisify(sftp.opendir);
                makeDir = promisify(sftp.mkdir);
                try {
                    for (const filePath of filePaths) {
                        logger('Copying ' + filePath.localPath);
                        await createDirIfNeeded(sftp, dirname(filePath.remotePath));
                        await copyFile.call(sftp, filePath.localPath, filePath.remotePath);
                        logger('File copied to: ' + filePath.remotePath);
                    }
                } catch (error) {
                    reject(error);
                    return;
                }
                resolve();
            }
        });
    });
}

async function createDirIfNeeded(sftp: SFTPWrapper, remoteDirPath: string): Promise<void> {
    const pathSplit: string[] = remoteDirPath.split('/');

    let dirFound: boolean = false;
    let i: number = pathSplit.length;
    while (!dirFound) {
        if (i === 0) {
            throw 'Incorrect remotePath config option: ' + remoteDirPath;
        }
        const path: string = pathSplit.slice(0, i).join('/');

        try {
            await openDir.call(sftp, path);
        } catch (error) {
            i--;
            continue;
        }

        dirFound = true;
    }

    while (i < pathSplit.length) {
        i++;
        await makeDir.call(sftp, pathSplit.slice(0, i).join('/'));
    }
}

function resolveFilePaths(localFiles: string | string[], remotePath: string): Promise<DeployFilePath[]> {
    return new Promise((resolve, reject) => {
        if (typeof localFiles === 'string') {
            glob(localFiles, { absolute: true }, (error, files) => {
                if (error) {
                    reject(error);
                } else {
                    const slashIndex: number = getLastCommonSlashIndex(files);
                    resolve(files.map(filePath => ({ localPath: filePath, remotePath: remotePath + filePath.substring(slashIndex) })));
                }
            });
        } else {
            resolve(localFiles.map(filePath => ({ localPath: resolvePath(filePath), remotePath: remotePath + '/' + basename(filePath) })));
        }
    });
}

function getLastCommonSlashIndex(filePathArray: string[]): number {
    let minIndex: number = Number.MAX_SAFE_INTEGER;

    for (const filePath of filePathArray) {
        const slashIndex: number = filePath.lastIndexOf('/');
        if (slashIndex < minIndex) {
            minIndex = slashIndex;
        }
    }

    return minIndex;
}
