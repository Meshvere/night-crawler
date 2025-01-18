// 1 - Import de puppeteer
const puppeteer = require('puppeteer');
// const { exec } = require("child_process");
const fs = require('fs');
const CryptoJS = require("crypto-js");

const fileEncoding = 'utf8';

const formatDate = (date) => {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

var baseURL;
const baseDir = __dirname+'/pdfs/'+formatDate(new Date())+'/';
var urls = [];
const visited = [];
var pageNum = 0;

process.argv.forEach(function (val, index, array) {
    if(index === 2) {
        baseURL = val;
        urls.push(val);
    }
});

const trim = (s, mask) => {
    while (~mask.indexOf(s[0])) {
        s = s.slice(1);
    }

    while (~mask.indexOf(s[s.length - 1])) {
        s = s.slice(0, -1);
    }

    return s;
}

const getFilePath = (url, ext) => {
    var filePath = trim(url, '/').replace(new RegExp('^'+baseURL), '');
    
    if(!filePath) {
        filePath = 'accueil';
    }
    
    dirPath = filePath.split('/');
    fileName = dirPath.pop()+'.'+ext;
    
    let thePath = 'pdfs/'+formatDate(new Date())+'/'+dirPath.join('/');
    thePath = thePath.replace('//', '/');
    
    fs.mkdir(thePath, { recursive: true }, (err) => {
        if (err) throw err;
    });
    
    return {dir: baseDir+'/'+dirPath.join('/'), file: fileName};
}

// -------------------------------------

const getPage = async(browser, url) => {
    const page = await browser.newPage();
	
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    await page.emulateMediaType('screen');
        
    return page;
}

const getAllUrl = async (page) => {
    await page.waitForSelector('body');

    return await page.evaluate(() =>
        [...document.querySelectorAll('a')].map(link => link.href),
    );
}

const checkSumChanged = async(page, fileDesc) => {
    var isChanged = undefined;
    
    var filePath = fileDesc.dir+'/'+fileDesc.file;
    
    var bodyHTML = await page.evaluate(() => document.body.innerHTML);
    
    var h_sha3_1 = CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(bodyHTML), { outputLength: 2048 }).toString();

    return new Promise((resolve, reject) => {
        fs.readFile(filePath, fileEncoding, (err, data) => {
            if (err) {
                isChanged = true;
                
                fs.writeFile(filePath, h_sha3_1, (err) => {
                    if (err) throw err;
                });
            } else {
                isChanged = data != h_sha3_1;
                
                if(isChanged) {
                    fs.writeFile(filePath, h_sha3_1, (err) => {
                        if (err) throw err;
                    });
                }
            }
            
            resolve(isChanged);
        });
    });
}

const toPDF = async (url) => {
    var filePath = trim(url, '/').replace(new RegExp('^'+baseURL), '');
    
    if(filePath == '') {
        filePath = 'accueil';
    }
    
    dirPath = filePath.split('/');
    fileName = dirPath.pop();
    fileNamePdf = fileName+'.pdf'; //+'-'+formatDate(new Date())
    
    let thePath = 'pdfs/'+formatDate(new Date())+'/'+dirPath.join('/');
    thePath = thePath.replace('//', '/');
    
    fs.mkdir(thePath, { recursive: true }, (err) => {
        if (err) throw err;
    });
    
    // 
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    // await page.goto(url, {waitUntil: 'networkidle2'});
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 13000});

    await page.emulateMediaType('screen');
    await page.setViewport({ width: Math.ceil(210/25.4*96), height: Math.ceil(297/25.4*96) });
    var html = await page.evaluate(() => document.documentElement.outerHTML);
    //Virer le lazy loading des images
    await page.setContent(html.replace(/loading="lazy"/g, 'loading="eager"').replace('class="warp"', ''));
    await page.waitForTimeout(30000);
    await page.pdf({path: thePath+'/'+fileNamePdf, format: 'A4', displayHeaderFooter: true, headerTemplate: 'date - title', footerTemplate:'url    pageNumber/totalPages', printBackground: true, preferCSSPageSize: true, scale: 0.75, width: '210mm', 'height': '297mm'});
  
    await browser.close();
};

const scrap = async (url) => {
    return new Promise((resolve, reject) => {
        var fileDesc = getFilePath(url, 'chksum')
    
        puppeteer.launch({ headless: true }).then(browser => {
            getPage(browser, url).then(page => {
                getAllUrl(page).then(urlList => {
                    checkSumChanged(page, fileDesc).then(isChanged => {
                        browser.close();
                        
                        if(isChanged) {
                            toPDF(url).then(done => {
                                resolve(urlList);
                            })
                        } else {
                            resolve(urlList);
                        }
                    })
                })
            }, error => {
                console.log('scrap error');
                console.warn(error);
                reject(error);
            });
        });
    });
}

const getNextPage = async () => {
    var url = urls[pageNum];
    console.log('----------'+pageNum+'----------')
    console.log(url);
    
    pageNum++;
    if(url != undefined) {
        if(visited.indexOf(url) < 0) {
            visited.push(url);
            
            scrap(url).then(nextUrls => {
                nextUrls.forEach(item => {
                    item = item.replace(/[#\?].*/g, '');
        
                    if(item.match(new RegExp("^"+baseURL, 'g')) && !item.match(new RegExp("wp-content/uploads", 'g'))) {
                        if(urls.indexOf(trim(item, '/')) < 0 && urls.indexOf(item) < 0) {
                            urls.push(item);
                        }
                    }
                });
                
                getNextPage();
            }, error => {
                console.log('getNextPage error');
                console.warn(error);
                getNextPage();
            }).catch(err => {
                console.log('getNextPage.scrap error')
                console.log(err)
                reject(err)
            });
        } else {
            getNextPage();
        }
    }
}

getNextPage().then(value => {
    // console.log(value);
    // console.log(urls);
    // console.log(visited)
}, error => {
    console.log('main fnct error');
    console.warn(error);
}).catch(err => {
    console.log('getNextPage.scrap error')
    console.log(err)
    reject(err)
});
