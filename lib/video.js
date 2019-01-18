/* eslint-disable max-lines */
/* eslint-disable no-console */
/* eslint-disable max-params */
const fs = require('fs');
const ytdl = require('ytdl-core');
const mkdirSync = require('mkdir-recursive').mkdirSync;
const os = require('os');
const request = require('request');
const progress = require('request-progress');
const tmpDir = os.tmpdir();
const readline = require('readline');
const path = require('path');

const fileExist = filePath => {
    let stats;
    try {
        // Query the entry
        stats = fs.lstatSync(filePath);
        if (stats.size > 0) {
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    catch (e) {
        return Promise.resolve(false);
    }
}

const displayProgress = function(percent, downloaded, total) {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`          ${(percent * 100).toFixed(2)}% downloaded`);
    process.stdout.write(`(${(downloaded / 1024 /1024).toFixed(2)}MB of ${(total / 1024 /1024).toFixed(2)}MB)\n`);
    readline.moveCursor(process.stdout, 0, -1);
}

const downloadFile = async (url, folder, title, force = false) => {
    mkdirSync(folder);
    const filePath = path.join(folder, title);
    const tempFilePath = path.join(tmpDir, title);
    
    if(!force && await fileExist(filePath)) {
        console.log('Already downloaded to', filePath);
        return Promise.resolve(false);
    } 


    const fileStream = fs.createWriteStream(tempFilePath)
    /* eslint-disable multiline-ternary */
    /* eslint-disable no-ternary */
    const dwURL = url.indexOf('/') === 0 ? 'https://courses.ionisx.com' + url : url;

    const video = progress(request({
        url : dwURL,
        headers: {
            // file server eas.elephorm.com don't send content-length if not send 
            range: 'bytes=0-'
        }
    }))
    
    var end = new Promise(function(resolve, reject) {
        fileStream.on('finish', () => resolve(true));
        fileStream.on('error', reject);
        video.on('error', reject);
        video.pipe(fileStream).on('error', reject); // or something like that. might need to close `hash`
    });

    video.on('progress', state => {
        displayProgress(state.percent, state.size.transferred, state.size.total, state.time.elapsed, state.time.remaining)
      });
    video.on('end', () => {
        readline.cursorTo(process.stdout, 0);
        fs.renameSync(tempFilePath, filePath)
        console.log('Saved to', filePath);
    });

    return end;
}

const downloadYoutubeUrl = async(url, folder, title, force) => {
    mkdirSync(folder);
    const filePath = path.join(folder, title + '.mp4');
    const tempFilePath = path.join(tmpDir, title + '.mp4');
    
    if(!force && await fileExist(filePath)) {
        console.log('Already downloaded to', filePath);
        return Promise.resolve(false);
    } 
    const fileStream = fs.createWriteStream(tempFilePath)
    const video = ytdl(url.replace('embed', 'watch'), { filter: (format) => format.container === 'mp4' });
    let starttime;
    var end = new Promise(function(resolve, reject) {
        fileStream.on('finish', () => resolve(true));
        fileStream.on('error', reject);
        video.on('error', reject);
        video.pipe(fileStream).on('error', reject); // or something like that. might need to close `hash`
    });
    video.once('response', () => {
        starttime = Date.now();
    });
    video.on('progress', (chunkLength, downloaded, total) => {
        const percent = downloaded / total;
        const elapsed = (Date.now() - starttime) / 1000;
        const remaining = elapsed / percent - elapsed;
        displayProgress(percent, downloaded, total, elapsed, remaining);
      });
    video.on('end', () => {
        readline.cursorTo(process.stdout, 0);
        fs.renameSync(tempFilePath, filePath)
        console.log('Saved to', filePath);
    });
    return end;
}

module.exports = {
    downloadFile,
    downloadYoutubeUrl
}