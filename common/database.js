const pg = require('pg-promise')({});

const db = pg({
    host: 'localhost',
    database: 'ba',
    user: 'ba',
    password: process.env.PG_PASSWORD,
});

module.exports = {
    pg,
    db,
};
