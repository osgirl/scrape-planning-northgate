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
    return Array.from({ length: new Date().getFullYear() - Config.startYear + 1 }).map((_, i) => {
        const year = Config.startYear + i
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
        return base + Cheerio.load(row)('[title="View Application Details"] a').attr('href').replace(/\s+/g, '')
        // return {
        //     url: base + Cheerio.load(row)('[title="View Application Details"] a').attr('href').replace(/\s+/g, ''),
        //     number: Cheerio.load(row)('[title="View Application Details"] a').text().trim(),
        //     address: Cheerio.load(row)('[title="Site Address"]').text().trim(),
        //     proposal: Cheerio.load(row)('[title="Development Description"]').text().trim().replace(/\r/g, '').replace(/\n+/, '\n'),
        //     status: Cheerio.load(row)('[title="Status"]').text().trim(),
        //     registeredDate: Cheerio.load(row)('[title="Date Registered"]').text().trim(),
        //     decision: Cheerio.load(row)('[title="Decision"]').text().trim()
        // }
    })
}

function details(response) {
    const document = Cheerio.load(response.body)
    return {
        url: response.request.href,
        number: document('.dataview:nth-of-type(3) ul li:nth-of-type(1) div').contents().get(2).data.trim(),
        address: document('.dataview:nth-of-type(3) ul li:nth-of-type(2) div').contents().get(2).data.trim(),
        type: document('.dataview:nth-of-type(3) ul li:nth-of-type(3) div').contents().get(2).data.trim(),
        development: document('.dataview:nth-of-type(3) ul li:nth-of-type(4) div').contents().get(2).data.trim(),
        proposal: document('.dataview:nth-of-type(3) ul li:nth-of-type(5) div').contents().get(2).data.trim().replace(/\s+/g, ' '),
        status: document('.dataview:nth-of-type(3) ul li:nth-of-type(6) div').contents().get(2).data.trim(),
        applicant: document('.dataview:nth-of-type(3) ul li:nth-of-type(7) div').contents().get(2).data.trim(),
        agent: document('.dataview:nth-of-type(3) ul li:nth-of-type(8) div').contents().get(2).data.trim(),
        wards: document('.dataview:nth-of-type(3) ul li:nth-of-type(9) div').contents().get(2).data.trim(),
        constituency: document('.dataview:nth-of-type(3) ul li:nth-of-type(10) div').contents().get(2).data.trim(),
        location: document('.dataview:nth-of-type(3) ul li:nth-of-type(11) div').contents().get(2).data.match(/Easting (.*) Northing (.*) /).splice(1, 2).join(', ').replace(/^, $/, ''),
        parishes: document('.dataview:nth-of-type(3) ul li:nth-of-type(12) div').contents().get(2).data.trim(),
        mapsheet: document('.dataview:nth-of-type(3) ul li:nth-of-type(13) div').contents().get(2).data.trim(),
        appealSubmitted: document('.dataview:nth-of-type(3) ul li:nth-of-type(14) div').contents().get(2).data.trim(),
        appealDecision: document('.dataview:nth-of-type(3) ul li:nth-of-type(15) div').contents().get(2).data.trim(),
        caseOfficer: document('.dataview:nth-of-type(3) ul li:nth-of-type(16) div').contents().get(2).data.trim().replace(/\s+/g, ' '),
        division: document('.dataview:nth-of-type(3) ul li:nth-of-type(17) div').contents().get(2).data.trim(),
        planningOfficer: document('.dataview:nth-of-type(3) ul li:nth-of-type(18) div').contents().get(2).data.trim().replace(/\s+/g, ' '),
        recommendation: document('.dataview:nth-of-type(3) ul li:nth-of-type(19) div').contents().get(2).data.trim(),
        determinationLevel: document('.dataview:nth-of-type(3) ul li:nth-of-type(20) div').contents().get(2).data.trim(),
        registeredDate: document('.dataview:nth-of-type(2) ul li:nth-of-type(1) div').contents().get(2).data.trim(),
        commentsUntilDate: document('.dataview:nth-of-type(2) ul li:nth-of-type(2) div').contents().get(2).data.trim(),
        committeeDate: document('.dataview:nth-of-type(2) ul li:nth-of-type(3) div').contents().get(2).data.trim(),
        decisionDate: document('.dataview:nth-of-type(2) ul li:nth-of-type(4) div').contents().get(2).data.trim().replace(/\s+/g, ' '),
        appealLodgedDate: document('.dataview:nth-of-type(2) ul li:nth-of-type(5) div').contents().get(2).data.trim(),
        appealDecisionDate: document('.dataview:nth-of-type(2) ul li:nth-of-type(6) div').contents().get(2).data.trim().replace(/\s+/g, ' ')
    }
}

Highland(Config.locations)
    .flatMap(http)
    .flatMap(search)
    .flatMap(http)
    .map(extract)
    .flatMap(http)
    .flatMap(results)
    .flatMap(http)
    .map(details)
    .errors(e => console.error(e.stack))
    .through(CSVWriter())
    .pipe(FS.createWriteStream('planning-northgate.csv'))
