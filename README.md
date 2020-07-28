# An Analysis of the State of Electron Security in the Wild

> The source code for the automated analysis of security indicators of Electron apps from my bachelor's thesis.

![Running the analysis.](https://cdn.baltpeter.io/img/thesis-electron-analysis-src-screenshot.png)

For my bachelor's thesis, I developed a series of scripts to automatically fetch, download, (if necessary) extract, and analyse Electron apps for indicators of potential security problems. The scripts first collect a list of open and closed source apps from GitHub and the [Electron app list](https://www.electronjs.org/apps). In the next step, these apps are then downloaded and the closed source ones are extracted. Finally, the apps are scanned using `npm audit` and a [custom fork](https://github.com/baltpeter/en-ba) of Doyensec's great [Electronegativity](https://github.com/doyensec/electronegativity).

## Setup

These instructions have been tested on Ubuntu 18.04 and 20.04. Other systems will also work but the steps might vary slightly.

First, install Git:

```sh
sudo apt install git
```

Then, install Postgres which is used as the database backend and create the user and database `ba`:

```sh
sudo apt install postgresql postgresql-contrib -y
sudo -u postgres createuser -EPd ba
sudo -u postgres createdb ba
sudo adduser ba
```

Login to the database (`sudo -u ba psql -d ba`) and create the following tables:

```sql
create table apps (
    slug text primary key,
    name text,
    url text,
    repository text unique,
    skip boolean
);
create table app_downloads (
    slug text primary key
        references apps
            on update cascade on delete cascade,
    repository_override text,
    windows_download text,
    mac_download text,
    linux_download text
);
create table apps_meta
(
    slug text primary key
        references apps
            on update cascade on delete cascade,
    downloaded boolean default false,
    extracted_dir text,
    download_strategy text
);
create table app_scans
(
    slug text primary key
        references apps
            on update cascade on delete cascade,
    stats jsonb,
    electronegativity_results jsonb,
    electronegativity_errors jsonb,
    audit_result jsonb,
    scanned boolean
);
```

Install Node.js and Yarn:

```sh
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt update
sudo apt install build-essential nodejs yarn libkrb5-dev p7zip-full -y
```

Create a [personal access token](https://github.com/settings/tokens) on GitHub, it needs to have the `repo` and `read:packages` permissions. Then, export the token and the database password like so:

```sh
export GITHUB_AUTH_TOKEN=token
export PG_PASSWORD=password
```

Login to the GitHub package repository with Yarn using your username, the access token as the password and an email address:

```sh
npm login --registry=https://npm.pkg.github.com
```

Clone the source code and install the required packages:

```sh
git clone https://github.com/baltpeter/thesis-electron-analysis-src.git
cd thesis-electron-analysis-src
yarn
```

Clone the Electron apps list:

```sh
cd app-list
git clone --depth 1 https://github.com/electron/apps.git
cd ..
```

Create the output directory for the apps and make sure you have the permission to read and write there (alternatively, you can also change the output directory in `download/fetch-apps.js`):

```sh
sudo mkdir -p /data/apps
sudo chown -R youruser:yourgroup /data/apps
```

## Running the analysis

### Collecting apps

To collect apps from GitHub and the Electron apps list, run:

```sh
cd app-list
node collect-apps.js
cd ..
```

The found apps are saved in the `apps` table. For the apps on the Electron app list without a repository, download links need to be collected manually and saved in the `app_downloads` table.

### Downloading apps

To download the apps and extract the closed source ones, run:

```sh
cd download
node fetch-apps.js
cd ..
```

The extracted apps are saved in `/data/apps` and their metadata can be found in the `apps_meta` table.

### Analysing the apps

To analyse the apps, run:

```sh
cd scan
node scan-apps.js
cd ..
```

The results are saved in the `app_scans` table.

## LICENSE

This code is licensed under the MIT license, see the [`LICENSE`](LICENSE) file for details.

[Electronegativity](https://github.com/doyensec/electronegativity) and [my fork](https://github.com/baltpeter/en-ba) are licensed under the [Apache license](https://github.com/baltpeter/en-ba/blob/master/LICENSE).
