const core = require('@actions/core')
const { exec } = require('@actions/exec')
const request = require('request-promise-native')
const chalk = require('chalk')

const divvycloudLoginUrl = 'https://divvycloud-dev.byu.edu/v2/public/user/login'
const divvycloudScanUrl = 'https://divvycloud-dev.byu.edu/v3/iac/scan'

async function jsonFromPlan (workDir, planFileName) {
  // run terraform show -json to parse the plan into a json string
  let output = ''
  const options = {
    listeners: {
      stdout: (data) => {
        // captures the standard output of the terraform show command and appends it to the variable 'output'
        output += data.toString('utf8')
      }
    },
    cwd: workDir // execute the command from working directory 'dir'
  }
  core.debug(`execOptions: ${JSON.stringify(options)}`)
  core.startGroup('Plan to be Scanned')
  await exec('terraform', ['show', '-json', planFileName], options)
  core.endGroup()

  // pull out any extra fluff from terraform wrapper from the hashicorp/setup-terraform action
  const json = output.match(/{.*}/)
  if (json === null) {
    core.debug('** start of output **')
    core.debug(output)
    core.debug('** end of output **')
    throw Error('There was an error while parsing your Terraform plan. The output from "terraform show -json" didn\'t match with /{.*}/ as expected.')
  }

  core.debug('** matched json **')
  core.debug(json[0])
  core.debug('** end matched json **')

  return json[0]
}

async function getAuthToken (username, password) {
  try {
    const { session_id: token } = await request({
      method: 'POST',
      uri: divvycloudLoginUrl,
      body: { username, password },
      json: true
    })
    core.setSecret(token)
    return token
  } catch (e) {
    throw Error('An error occurred while getting a token for DivvyCloud. Did you provide a valid username/password?')
  }
}

async function getScan (authToken, author, scanName, json) {
  const { statusCode, body } = await request({
    method: 'POST',
    uri: divvycloudScanUrl,
    body: {
      scan_name: scanName,
      author_name: author,
      scan_template: json,
      config_name: 'Test Scan',
      iac_provider: 'terraform'
    },
    json: true,
    resolveWithFullResponse: true,
    simple: true,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
      'X-Auth-Token': authToken
    }
  })
  return { statusCode, body }
}

const green = chalk.green
const lightGreen = chalk.ansi()
const yellow = chalk.ansi()
const lightYellow = chalk.ansi()
const red = chalk.ansi()
const lightRed = chalk.ansi()

// most @actions toolkit packages have async methods
async function run () {
  try {
    // Workflow Inputs
    const planFileName = core.getInput('terraform-plan-file', { required: true })
    const workDir = core.getInput('working-directory', { required: true })
    const username = core.getInput('divvycloud-username', { required: true })
    const password = core.getInput('divvycloud-password', { required: true })

    // Environment variables
    const scanName = process.env.GITHUB_REPO + '.' + process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_NUMBER
    const author = process.env.GITHUB_ACTOR

    // Get Terraform plan
    const json = await jsonFromPlan(workDir, planFileName)

    // DivvyCloud Auth token
    const authToken = await getAuthToken(username, password)

    // Send JSON plan to DivvyCloud
    const { statusCode, body: scanResult } = await getScan(authToken, author, scanName, json)

    core.info(`Status Code: ${statusCode}`)
    core.startGroup('Full Scan Results')
    core.info(JSON.stringify(scanResult, null, 2))
    core.endGroup()

    core.info('\nSummary:')
    core.info(chalk.green(`Passed Insights (${scanResult.details.passed_insights.length})`))
    scanResult.details.passed_insights.forEach(insight => {
      core.info(chalk.greenBright(insight.name))
      core.startGroup(chalk.greenBright(`Description: ${insight.description} (Expand for more details)`))
      core.info(chalk.greenBright(insight.notes))
      core.endGroup()
      core.info(chalk.greenBright('Resources:'))
      insight.success.forEach(resourceId => {
        const terraformId = scanResult.resource_mapping[resourceId].address
        core.info(`\t${chalk.greenBright(terraformId)}`)
      })
    })

    if (statusCode === 200) {
      core.info('[DivvyCloud]: Scan completed successfully. All insights have passed.')
    } else if (statusCode === 202) {
      core.warning('[DivvyCloud]: Scan completed successfully, but with warnings. All failure-inducing insights have passed, but some warning-inducing insights did not.')
    } else if (statusCode === 406) {
      core.setFailed('[DivvyCloud]: Scan completed, but one or more insights have failed. Please check the DivvyCloud console for more information.')
    } else {
      core.warning('[DivvyCloud]: Scan failed to return correct response. Please contact the DivvyCloud Admins.')
    }
  } catch (error) {
    core.setFailed(error)
  }
}

run()
