const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const mkdirSync = require('mkdir-recursive').mkdirSync;
const puppeteer = require('puppeteer');
const inquirer = require('inquirer');
var sanitize = require("sanitize-filename");

/* eslint-disable no-console */
/* eslint-disable max-params */

const ROOT_DOWNLOAD = path.join('.','download');

const numberToString = function(num) {
    const longString = ('000'  + num);
    return longString.substring(longString.length -3, longString.length);
} 

const downloadUrl = (url, folder, title) => {
    mkdirSync(folder);
    const filePath = path.join(folder, title + '.mp4');
    let stats;
    try {
        // Query the entry
        stats = fs.lstatSync(filePath);
        if (stats.size > 0) {
            console.log('Already downloaded to', filePath);
            return Promise.resolve();
        }
    }
    catch (e) {
        // ...
    }
    const fileStream = fs.createWriteStream(filePath)
    const video = ytdl(url.replace('embed', 'watch'), { filter: (format) => format.container === 'mp4' });
    let starttime;
    var end = new Promise(function(resolve, reject) {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
        video.on('error', reject);
        video.pipe(fileStream).on('error', reject); // or something like that. might need to close `hash`
    });
    video.once('response', () => {
        starttime = Date.now();
    });
    video.on('progress', (chunkLength, downloaded, total) => {
        const readline = require('readline');
        const percent = downloaded / total;
        const downloadedMinutes = (Date.now() - starttime) / 1000 / 60;
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`${(percent * 100).toFixed(2)}% downloaded`);
        process.stdout.write(`(${(downloaded / 1024 / 1024).toFixed(2)}MB of ${(total / 1024 / 1024).toFixed(2)}MB)\n`);
        process.stdout.write(`running for: ${downloadedMinutes.toFixed(2)}minutes`);
        process.stdout.write(`, estimated time left: ${(downloadedMinutes / percent - downloadedMinutes).toFixed(2)}minutes `);
        readline.moveCursor(process.stdout, 0, -1);
      });
    video.on('end', () => {
        console.log('\n');
        console.log('Saved to', filePath);
    });
    return end;
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
            continue;
        }
        await page.goto(chapter.value).catch(async (e) => {
            console.error('failed navigate to', chapter.value)
            await page.screenshot({ path: "error.png" })
            throw e;
        })
        // await page.waitForNavigation();
        const src = await page.$eval("iframe[title='YouTube video player']", el => el.src, {timeout: 5000})
        .catch(() => {
            console.log('No video available');
        })
        if (src) {
            const folder = path.join(options.root_path, sanitize(course), sanitize(chapter.module));
            await downloadUrl(src, folder, sanitize('Chapitre ' + numberToString(index) + ' ' + chapter.name))
            .catch(async (e) => {
                await page.screenshot({ path: "error.png" })
                console.error(e, 'on', src);
            });
        }
        console.groupEnd();
    }
    console.groupEnd();
}


const collectChapters = async (page, modules, course, options) => {
    console.group('Modules');
    console.log(`Discovering ${modules.length} modules`)
    let index = 0;
    for (const module of modules) {
        index++;
        console.group(`Module ${numberToString(index)} : ${module.name}`);
        await page.goto(module.value);
        await page.waitForSelector('.chapter li');
        let newChapters = await page.evaluate(() => {
            const chapters = [];
            document.querySelectorAll('.chapter li a').forEach(dom => chapters.push({name: dom.querySelector('p').innerText, value: dom.href}))
            return chapters;
        })

        newChapters = newChapters.map(newChapter => {
            newChapter.module = 'Module ' + numberToString(index) + ' ' + module.name;
            return newChapter;
        })

        await downloadChapters(page, newChapters, course.title, options).catch(async (e) => {
            await page.screenshot({ path: "error.png" })
            throw e;
        });
        console.groupEnd();
    }
    console.groupEnd();

    
}

const collectModules = async (page, course, options) => {
    console.group('Courses ' + course.title);
    console.log('Loading course page')
    await page.goto(course.href);
    await page.waitForSelector('.course-component-module-title');
    console.log('Discovering modules')
    const modules = await page.evaluate(() => {
        const modules = [];
        document.querySelectorAll('.course-component-module-title a').forEach(dom => modules.push({name: dom.innerText, value: dom.href}))
        return modules;
    })

    await collectChapters(page, modules, course, options).catch(async (e) => {
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
        type: 'input',
        name: 'password',
        message: 'Quel est votre mot de passe (ne sera pas stocké) ? ',
        default : process.argv[3]
    },
    {
        type: 'input',
        name: 'root_path',
        message: 'Dossier de télécahrgement',
        default : ROOT_DOWNLOAD
    }
    ];
    
    return await inquirer.prompt(questions)
}


const launch = async () => {
    try {
    const credentials  = await promptCredentials();
    const browser = await puppeteer.launch({headless: true});
    const url = 'https://ionisx.com/auth/azure-ecoles';
    const page = await browser.newPage();
    await page.setViewport({ width: 1980, height: 1260 })
    await page.goto(url);
    console.log(`Connecting on office 365`)
    await page.focus('#i0116');
    await page.type('#i0116' ,credentials.login); // your login here
    page.click('#idSIButton9');
    await page.waitForNavigation();
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
    catch(e) {
        console.error(e);
        process.exit(2);
    }
}

launch().catch(e => {
    console.error(e);
    process.exit(1);
});