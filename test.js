const lib = require('./lib/video');
/* eslint-disable no-console */

const testDownloadFile = async () => {
    try {
        console.log(lib);
        await lib.downloadFile('https://eas.elephorm.com/video/57e36aab013e7a3b00a1e8fd?1546250049916', './download', 'testfile', true);
        console.log('download done');
    }
    catch(e) {
        console.error(e);
    }
   
}

const testDownloadYoutube = async () => {
    try {
        console.log(lib);
        await lib.downloadYoutubeUrl('https://www.youtube.com/embed/cWUbsZIn13k?controls=0&wmode=transparent&rel=0&showinfo=0&enablejsapi=1&modestbranding=1&html5=1&origin=https%3A%2F%2Fcourses.ionisx.com&widgetid=1', './download', 'testyoutube', true);
        console.log('download done');
    }
    catch(e) {
        console.error(e);
    }
   
}

testDownloadFile();
testDownloadYoutube();