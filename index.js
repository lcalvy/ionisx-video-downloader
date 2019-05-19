/* eslint-disable max-lines */
/* eslint-disable no-console */
/* eslint-disable max-params */
const path = require('path');
const puppeteer = require('puppeteer');
const inquirer = require('inquirer');
const sanitize = require("sanitize-filename");
const videoLib = require('./lib/video');
const mkdirSync = require('mkdir-recursive').mkdirSync;

const ROOT_DOWNLOAD = path.join('.','download');
const errors = [];
let numberProcessedVideos = 0;
let numberDownloadedVideos = 0;
let numberDownloadedPDF = 0;
const numberToString = function(num) {
    const longString = ('000'  + num);
    return longString.substring(longString.length -3, longString.length);
}

const sleep = function(ms) {
    return new Promise(resolve => {
        setTimeout(resolve,ms)
    })
}

const retryNavigate = async (page, url, contextInfo) => {
    await page.goto(url, {waitUntil: 'networkidle0'})
        .catch(async () => {
            await sleep(5000);
            await page.goto('https://ionisx.com/dashboard',{waitUntil: 'networkidle0'});
            await page.goto(url, {waitUntil: 'networkidle0'}).catch(async (e2) => {
                console.error(e2)
                await page.screenshot({ path: sanitize(url) + '.png' });
                errors.push(`Unable to navigate to ${contextInfo} ${url}`)
                throw new Error(`Unable to navigate to ${contextInfo} ${url}`)
            })
        });
}

const asyncForEach = async function (array, callback) {
    for (let index = 0; index < array.length; index++) {
        // eslint-disable-next-line callback-return
        await callback(array[index], index, array);
    }
  }

const lookupYoutube = async (page, chapter, course, rootPath, index) => {
    const srcYoutubes = await page.$$eval("iframe[title='YouTube video player']", els => els.map(el => el.src))
        .catch(() => {
            console.log('No Youtube embed video available');
        })
        if (!srcYoutubes || srcYoutubes.length === 0) {
            return false;
        }

        await asyncForEach(srcYoutubes, async (srcYoutube, fileIndex) => {
            numberProcessedVideos++;
            let fileIndexSuffix = '';
            if(fileIndex > 0) {
                fileIndexSuffix = '.' + numberToString(fileIndex + 1);
            }
            const videoTitle = sanitize(`M${chapter.moduleNum} C${numberToString(index) + fileIndexSuffix} ${chapter.name}`);
            const folder = path.join(rootPath, sanitize(course), sanitize(chapter.module));
            try {
                const dwloaded = await videoLib.downloadYoutubeUrl(srcYoutube, folder, videoTitle);
                if (dwloaded === true) {
                    numberDownloadedVideos++;
                }
            }
            catch(e1) {
                try {
                    const dwloaded = await videoLib.downloadYoutubeUrl(srcYoutube, folder, videoTitle);
                    if (dwloaded === true) {
                        numberDownloadedVideos++;
                    }
                }
                catch(e2) {
                    console.error(e2, 'on', srcYoutube);
                    errors.push(`Unable to download video ${course} ${chapter.name} ${srcYoutube}`)
                }
            }
        })

        return true;
}


const lookupHtmlVideo = async (page, chapter, course, rootPath, index) => {
    const srcVideos = await page.$$eval("video source", els => els.map(el => el.src))
        .catch(() => {
            console.log('No video player available');
        })
        if (!srcVideos || srcVideos.length === 0) {
            return false;
        }

        await asyncForEach(srcVideos, async (srcVideo, fileIndex) => {
            numberProcessedVideos++;
            let fileIndexSuffix = '';
            if(fileIndex > 0) {
                fileIndexSuffix = '.' + numberToString(fileIndex + 1);
            }
            const videoTitle = sanitize(`M${chapter.moduleNum} C${numberToString(index) + fileIndexSuffix} ${chapter.name}`);
            const folder = path.join(rootPath, sanitize(course), sanitize(chapter.module));
            try {
                const dwloaded = await videoLib.downloadFile(srcVideo, folder, videoTitle + '.mp4');
                if (dwloaded === true) {
                    numberDownloadedVideos++;
                }
            }
            catch(e1) {
                try {
                    const dwloaded = await videoLib.downloadFile(srcVideo, folder, videoTitle + '.mp4');
                    if (dwloaded === true) {
                        numberDownloadedVideos++;
                    }
                }
                catch(e2) {
                    console.error(e2, 'on', srcVideo);
                    errors.push(`Unable to download video ${course} ${chapter.name} ${srcVideo}`)
                }
            }
        });
        return true;
}

const lookupPDF = async (page, chapter, course, rootPath, index) => {
    const srcPDFs = await page.$$eval(".pdf-download-button a", els => els.map(el => el.href))
        .catch(() => {
            console.log('No PDF file available');
        })
        if ((!srcPDFs || srcPDFs.length === 0) && chapter.name.indexOf('Cours') === -1) {
            return false;
        }
        await asyncForEach(srcPDFs, async (srcPDF, fileIndex) => {
            numberProcessedVideos++;
            let fileIndexSuffix = '';
            if(fileIndex > 0) {
                fileIndexSuffix = '.' + numberToString(fileIndex + 1);
            }
            const pdfTitle = sanitize(`M${chapter.moduleNum} C${numberToString(index) + fileIndexSuffix} ${chapter.name}`);
            const folder = path.join(rootPath, sanitize(course), sanitize(chapter.module));
            try {
                const dwloaded = await videoLib.downloadFile(srcPDF, folder, pdfTitle+ '.pdf');
                if (dwloaded === true) {
                    numberDownloadedPDF++;
                }
            }
            catch(e1) {
                try {
                    const dwloaded = await videoLib.downloadFile(pdfTitle, folder, pdfTitle + '.pdf');
                    if (dwloaded === true) {
                        numberDownloadedPDF++;
                    }
                }
                catch(e2) {
                    console.error(e2, 'on', srcPDF);
                    errors.push(`Unable to download pdf ${course} ${chapter.name} ${srcPDF}`)
                }
            }
        });

        if (chapter.name.indexOf('Cours') === 0) {
            const folderPath = path.join(rootPath, sanitize(course), sanitize(chapter.module));
            mkdirSync(folderPath);
            const pdfTitle = sanitize(`M${chapter.moduleNum} C${numberToString(index)} ${chapter.name}-page.pdf`);
            const filePath = path.join(folderPath,  pdfTitle);
            await page.pdf({ format: 'A4', path:  filePath});
            numberDownloadedPDF++;
        }
        return true;
}

const downloadChapters = async (page, chapters, course, options) => {
    console.group('Chapters');
    console.log(`Discovering ${chapters.length} chapters`)
    let index = 0;
    for (const chapter of chapters) {
        index++;
        console.group(`Chapter ${numberToString(index)} : ${chapter.name}`);
        if (chapter.name === "S'évaluer") {
            console.warn('Skipping', chapter.name);
            console.groupEnd();
            continue;
        }

        if (chapter.name.indexOf("Quiz") === 0) {
            console.warn('Skipping', chapter.name);
            console.groupEnd();
            continue;
        }

        try {
            await retryNavigate(page, chapter.value, `${course} ${chapter.name}`)
        }
        catch(e) {
            console.error(e);
            console.groupEnd();
            continue;
        }
        const found = await lookupYoutube(page, chapter, course, options.root_path, index);
        if (!found) {
            await lookupHtmlVideo(page, chapter, course, options.root_path, index);
        }

        await lookupPDF(page, chapter, course, options.root_path, index);

        console.groupEnd();
    }
    console.groupEnd();
}


const collectChapters = async (page, modules, course, options) => {
    console.group('Modules');
    console.log(`Discovering ${modules.length} modules`)
    for (const module of modules) {
        console.group(`Module ${numberToString(module.index)} : ${module.name}`);
        try {
            await retryNavigate(page, module.value, module.name);
        }
        catch (e) {
            console.error(e);
            console.groupEnd();
            continue;
        }
        await page.waitForSelector('.chapter li');
        let newChapters = await page.evaluate(() => {
            const chapters = [];
            document.querySelectorAll('.chapter li a').forEach(dom => chapters.push({name: dom.querySelector('p').innerText.replace(', current section', ''), value: dom.href}))
            return chapters;
        })

        newChapters = newChapters.map(newChapter => {
            newChapter.module = 'Module ' + numberToString(module.index) + ' ' + module.name;
            newChapter.moduleNum = numberToString(module.index);
            return newChapter;
        })

        await downloadChapters(page, newChapters, course.title, options).catch(async (e) => {
            await page.screenshot({ path: "error.png" })
            console.groupEnd();
            throw e;
        });
        console.groupEnd();
    }
    console.groupEnd();

    
}

const promptModules = async (modules) => {
    var questions = [
    {
        type: 'checkbox',
        name: 'modules',
        message: 'Quel modules voulez vous télécharger?',
        choices: modules
    }
    ];
    
    return await inquirer.prompt(questions)
}

const filterSelectedModules = function(modules, selectedModules) {
    return modules.filter(module => selectedModules.indexOf(module.value) >= 0);
}

const collectModules = async (page, course, options) => {
    console.group('Courses ' + course.title);
    console.log('Loading course page')
    await retryNavigate(page, course.href, course.title);
    await page.waitForSelector('.course-component-module-title');
    console.log('Discovering modules')
    const modules = await page.evaluate(() => {
        const modules = [];
        document.querySelectorAll('.course-component-module-title a').forEach(dom => modules.push({name: dom.innerText, value: dom.href}))
        return modules;
    })


    const checkboxModules = modules.map((module, index) => {
        module.checked = true;
        module.index = index + 1;
        return module;
    })

    let selectedModules = await promptModules(checkboxModules);
    selectedModules = filterSelectedModules(modules, selectedModules.modules);

    await collectChapters(page, selectedModules, course, options).catch(async (e) => {
        await page.screenshot({ path: "error.png" })
        throw e;
    });

    console.groupEnd();
}

const promptCourses = async (courses) => {
    var questions = [
    {
        type: 'list',
        name: 'courses',
        message: 'Quel cours voulez vous télécharger?',
        choices: courses
    }
    ];

    return await inquirer.prompt(questions)
}

const promptCredentials = async () => {
    var questions = [
    {
        type: 'input',
        name: 'login',
        message: 'Quel est votre login (xxx@ionisx.org) ?',
        default : process.argv[2]
    },
    {
        type: 'password',
        name: 'password',
        message: 'Quel est votre mot de passe (ne sera pas stocké) ? ',
        default : process.argv[3]
    },
    {
        type: 'input',
        name: 'root_path',
        message: 'Dossier de téléchargement',
        default : ROOT_DOWNLOAD
    }
    ];

    return await inquirer.prompt(questions)
}

const launch = async () => {
    const credentials  = await promptCredentials();
    const browser = await puppeteer.launch({headless: true});
    const url = 'https://ionisx.com/auth/azure-ecoles';
    const page = await browser.newPage();
    page.on('dialog', async dialog => {
    console.log(dialog.message());
        await dialog.accept();
    });
    await page.setViewport({ width: 1980, height: 1260, deviceScaleFactor: 2 })
    await page.goto(url, {waitUntil: 'networkidle0'});
    console.log(`Connecting on office 365`)
    await page.focus('#i0116');
    await page.type('#i0116' ,credentials.login); // your login here
    page.click('#idSIButton9');
    await page.waitForSelector('#i0118', { visible: true});
    await sleep(2000);
    await page.focus('#i0118');
    await page.type('#i0118', credentials.password); // your login here
    page.click('#idSIButton9');
    await page.waitForNavigation();
    page.click('#idSIButton9');
    await page.waitForSelector('.menu-cursus-cycle');
    console.log(`Discovering courses`)
    // await page.screenshot({ path: "screenshot.png" })
    const courses = await page.evaluate(() => {
        const courses = [];
        document.querySelectorAll('.menu-cursus-cycle li a').forEach(dom => courses.push({name: dom.innerText, value: {
            href: dom.href,
            title : dom.innerText
        }
        }))
        return courses;
    })

    const answers  = await promptCourses(courses);
    await collectModules(page, answers.courses, credentials)
    .catch(async (e) => {
        await page.screenshot({ path: "error.png" })
        throw e;
    })

    await browser.close();
}

if (require.main === module) {
    launch()
    .then(() => {
        if (errors.length > 0) {
            console.error("\x1b[31m", 'Job finished but some errors occured :');
            errors.forEach(error => {
                console.error("\x1b[31m", error);
            })
        }
        console.log(`Finished, enjoy learning: Videos processed=${numberProcessedVideos}, Videos downloaded=${numberDownloadedVideos}, PDF downloaded=${numberDownloadedPDF}`);
        process.exit(0);
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
}