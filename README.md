Scrape Planning: Northgate
==========================

UK [local planning authorities](https://en.wikipedia.org/wiki/Local_planning_authority) tend to have online planning portals. One of the [more popular](https://www.google.co.uk/search?q=site:gov.uk+inurl:planningexplorer") bits of software for providing this is produced by [Northgate Public Services](https://www.northgateps.com/).

This scrapes all the available records from one or more given Northgate planning portals into a CSV file.

Set which portals are to be scraped in `config.json`. An example is given in `config.example.json`.

Requires [Node](https://nodejs.org/).

Install the dependencies with `npm install`, then run `node planning-northgate`. Produces a file named `planning-northgate.csv`.
