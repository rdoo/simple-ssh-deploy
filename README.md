# Simple SSH Deploy
Simple node.js tool for deploying files and running commands over SSH

## Installation
```sh
$ npm install simple-ssh-deploy --save-dev
```

## Usage
```js
const simpleSSHDeploy = require('simple-ssh-deploy');

simpleSSHDeploy(config)
    .then(() => {
        // deploy succeeded
    })
    .catch(error => {
        // deploy failed
    });
```

## Config
```ts
const config = {
    // example SSH authentication object. For more auth options look here: https://github.com/mscdex/ssh2#client-methods
    auth: {
        host: string; // hostname or IP address
        port?: number; // by default is set to 22
        username?: string;
        password?: string;
    };
    localFiles?: string | string[]; // glob string or array of local files paths (array of glob strings is not supported)
    remotePath?: string; // path on remote server where files will be copied
    preDeploy?: string[]; // array of commands to be executed on remote server before files deploy
    postDeploy?: string[]; // array of commands to be executed on remote server after files deploy
    silent?: boolean; // disable logging to console, by default is set to false
};
```
Commands in preDeploy array are independent of each other and executed synchronously. If you want one command to depend on another use `&&` (example below). If a command throws an error then deploy stops and fails. To prevent this behavior use `2> /dev/null` or similar tricks (example below). The same apply to postDeploy commands.

Example config:
```js
const config = {
    auth: {
        host: '123.123.123.123',
        username: 'user',
        password: 'passwd'
    },
    localFiles: './build/**/*.js', // or array ['./build/file1.js', 'build/file2.js', 'D:/project/build/file3.js']
    remotePath: '/home/user/app',
    preDeploy: ['df -m', 'cd /home/user/app && ls', 'cd /home/user/app && rm file1.js 2> /dev/null'],
    postDeploy: ['cd /home/user/app && node file1.js']
};
```

## License
Copyright © 2018 [rdoo](https://github.com/rdoo). Released under the MIT license.