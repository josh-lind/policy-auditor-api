import { environment } from "./environment";
import API from "./api";

import express = require("express");
import bodyParser = require("body-parser");
import { checkDisplayNames } from "./lib/startup";

// Perform startup checks
checkDisplayNames();

/* Create a new Express Application */
const app = express();

// Parse POST request bodies
app.use(bodyParser.json());

// Add headers
app.use(function (req, res, next) {
    // Website you wish to allow to connect
    // res.setHeader("Access-Control-Allow-Origin", "http://localhost:4200");
    res.setHeader("Access-Control-Allow-Origin", "https://policy-auditor.herokuapp.com");

    // // Request methods you wish to allow
    // res.setHeader(
    //     "Access-Control-Allow-Methods",
    //     "GET, POST, OPTIONS, PUT, PATCH, DELETE"
    // );

    // // Request headers you wish to allow
    // res.setHeader(
    //     "Access-Control-Allow-Headers",
    //     "X-Requested-With,content-type"
    // );

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    // res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});

/* All routes prefixed with /api will be directed to the API router */
app.use("/api", API);

/* Start the app and listen for connections on the port specified in the environment file */
const port = process.env.PORT || environment.port;
const url = process.env.baseUrl || environment.baseUrl;
app.listen(port, () => {
    console.log(
        `Pizza Bot Backend is listening at http://${url}:${port}/api`
    );
});
