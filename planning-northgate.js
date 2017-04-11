const Highland = require('highland')
const Request = require('request')
const RetryMe = require('retry-me')
const Cheerio = require('cheerio')
const FS = require('fs')
const CSVWriter = require('csv-write-stream')
const Config = require('./config.json')

const http = Highland.wrapCallback((location, callback) => {
    const input = output => {
        Request.defaults({ jar: true })(location, (error, response) => {
            const failure = error ? error : (response.statusCode >= 400) ? new Error(response.statusCode) : null
            output(failure, response)
        })
    }
    RetryMe(input, { factor: 1.5 }, callback)
})

function search(response) {
    console.log('Scraping ' + response.request.uri.host + '...')
    const document = Cheerio.load(response.body)
    const startYear = 2000
    return Array.from({ length: new Date().getFullYear() - startYear + 1 }).map((_, i) => {
        const year = startYear + i
        return {
            method: 'POST',
            uri: response.request.href,
            form: {
                '__VIEWSTATE': document('[name=__VIEWSTATE]').attr('value'),
                '__VIEWSTATEGENERATOR': document('[name=__VIEWSTATEGENERATOR]').attr('value'),
                '__EVENTVALIDATION': document('[name=__EVENTVALIDATION]').attr('value'),
                'rbGroup': 'rbRange',
                'dateStart': '01-01-' + year,
                'dateEnd': '31-12-' + year,
                'csbtnSearch': 'Search'
            },
            year,
            followRedirect: false
        }
    })
}

function extract(response) {
    if (!response.headers.location) throw new Error('No redirect found')
    console.log('  Parsing data for the year ' + response.request.year + '...')
    const maximum = 100000 // a number greater than the expected number of planning applications each year
    return {
        uri: 'http://' + response.request.uri.host + response.headers.location.replace('PS=10', 'PS=' + maximum),
        headers: {
            'Referer': response.request.href
        }
    }
}

function results(response) {
    const document = Cheerio.load(response.body)
    const nextPage = document('[title="Goto Page 2"]').contents()
    if (nextPage.length > 0) throw new Error('Found a next-page link')
    const base = 'http://' + response.request.uri.host + response.request.uri.pathname.slice(0, response.request.uri.pathname.lastIndexOf('/')) + '/'
    return document('tr:not(:first-child)').get().map(row => {
        return {
            url: base + Cheerio.load(row)('[title="View Application Details"] a').attr('href').replace(/\s+/g, ''),
            number: Cheerio.load(row)('[title="View Application Details"] a').text().trim(),
            address: Cheerio.load(row)('[title="Site Address"]').text().trim(),
            proposal: Cheerio.load(row)('[title="Development Description"]').text().trim().replace(/\r/g, '').replace(/\n+/, '\n'),
            status: Cheerio.load(row)('[title="Status"]').text().trim(),
            registeredDate: Cheerio.load(row)('[title="Date Registered"]').text().trim(),
            decision: Cheerio.load(row)('[title="Decision"]').text().trim()
        }
    })
}

Highland(Config.locations)
    .flatMap(http)
    .flatMap(search)
    .flatMap(http)
    .map(extract)
    .flatMap(http)
    .flatMap(results)
    .errors(e => console.error(e.stack))
    .through(CSVWriter())
    .pipe(FS.createWriteStream('planning-northgate.csv'))
