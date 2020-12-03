# Pizza Bot Backend

This folder contains the backend portion of the Pizza Bot application, written in Typescript using the ExpressJS Framework.

## Set up

After cloning the repo, `cd pizza-bot-backend` and `npm install`. Then, add the API Key, Version ("2019-4-30"), and Discovery Service URL to the src/environment.ts file.

## Run the backend

`npm run dev` will run the application and listen for changes. Whenever a file is modified and saved, the application will be re-compiled and restarted.

To run without listening for changes, do `npm run prod`.

To simply build the project to the dist/ directory, run `npm run build`.

## Linting and Formatting

This project uses ESLint and Prettier for linting and formatting, respectively. The ESLint and Prettier VSCode plugins are nice and will help you find lint and formatting errors as you edit. The "format on save" VSCode option is also helpful.

To format your code, run `npm run format`.

To check your code for lint errors, run `npm run lint`.

To fix automatically fixable lint errors, run `npm run lint -- --fix`.
