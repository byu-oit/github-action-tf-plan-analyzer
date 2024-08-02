import * as core from '@actions/core'
import { exec } from '@actions/exec'
import { styleText } from 'node:util'

const divvycloudLoginUrl = 'https://byu.customer.divvycloud.com/v2/public/user/login'
const divvycloudScanUrl = 'https://byu.customer.divvycloud.com/v3/iac/scan'

async function jsonFromPlan (workDir, planFileName) {
  const exitCode = await exec('which tofu', undefined, {
    silent: true,
    ignoreReturnCode: true
  })
  const hasTofu = exitCode === 0
  const command = hasTofu ? 'tofu' : 'terraform'

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
  await exec(command, ['show', '-json', planFileName], options)
  core.endGroup()

  // pull out any extra fluff from terraform wrapper from the hashicorp/setup-terraform action
  const json = output.match(/{.*}/)
  if (json === null) {
    core.debug('** start of output **')
    core.debug(output)
    core.debug('** end of output **')
    throw new Error(
      'There was an error while parsing your Terraform plan. The output from "terraform show -json" didn\'t match with /{.*}/ as expected.'
    )
  }

  core.debug('** matched json **')
  core.debug(json[0])
  core.debug('** end matched json **')

  return json[0]
}

async function getAuthToken (username, password) {
  const data = { username, password }
  const response = await fetch(divvycloudLoginUrl, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json;charset=UTF-8'
    }
  })

  if (!response.ok) {
    const message = `An error occurred while getting a token for DivvyCloud: ${response.status}`
    core.debug(`Response Object: ${JSON.stringify(response)}`)
    throw new Error(message)
  }
  const { session_id: token } = await response.json()
  core.setSecret(token)
  return token
}

async function getScan (authToken, author, scanName, json) {
  const data = {
    scan_name: scanName,
    author_name: author,
    scan_template: json,
    config_name: 'Github Scan',
    iac_provider: 'terraform'
  }
  const response = await fetch(divvycloudScanUrl, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
      'X-Auth-Token': authToken
    }
  })

  // Normal Responses: 200, 202, 406
  const status = response.status
  if (![200, 202, 406].includes(status)) {
    const message = `[DivvyCloud]: Scan returned an unexpected response. Please contact the DivvyCloud Admins. Response: ${status}`
    core.debug(`DivvyCloud Response: ${JSON.stringify(response.json(), 0)}`)
    throw new Error(message)
  }
  const scanResult = response.json()
  return { status, scanResult }
}

function printSummary (scanResult) {
  core.debug('Printing summary')

  core.info(styleText(['bold', 'underline'], '\nSummary:'))

  core.debug('Printing passed insights')
  if (scanResult.details.passed_insights.length > 0) {
    core.info(
      styleText(
        ['bold', 'green'],
        `Passed Insights (${scanResult.details.passed_insights.length})`
      )
    )
  } else {
    core.info('Passed Insights (0)')
  }
  scanResult.details.passed_insights.forEach((insight) => {
    core.startGroup(styleText(['bold', 'green'], insight.name))
    core.info(styleText(['italic', 'greenBright'], insight.description))
    core.info(styleText('green', `Severity: ${insight.severity}`))
    core.info(styleText('greenBright', insight.notes))
    core.endGroup()
    insight.success.forEach((resourceId) => {
      const { address: terraformId, name } =
        scanResult.resource_mapping[resourceId]
      core.info(
        `  • ${styleText('greenBright', terraformId || `name = ${name}`)}`
      )
    })
  })

  core.debug('Printing warned insights')
  if (scanResult.details.warned_insights.length > 0) {
    core.info(
      styleText(
        ['bold', 'yellow'],
        `Warned Insights (${scanResult.details.warned_insights.length})`
      )
    )
  } else {
    core.info('Warned Insights (0)')
  }
  scanResult.details.warned_insights.forEach((insight) => {
    core.startGroup(styleText(['bold', 'yellow'], insight.name))
    core.info(styleText(['italic', 'yellowBright'], insight.description))
    core.info(styleText('yellow', `Severity: ${insight.severity}`))
    core.info(styleText('yellowBright', insight.notes))
    core.endGroup()
    insight.warning.forEach((resourceId) => {
      const { address: terraformId, name } =
        scanResult.resource_mapping[resourceId]
      core.info(
        `  • ${styleText('yellowBright', terraformId || `name = ${name}`)}`
      )
    })
  })

  core.debug('Printing failed insights')
  if (scanResult.details.failed_insights.length > 0) {
    core.info(
      styleText(
        ['bold', 'red'],
        `Failed Insights (${scanResult.details.failed_insights.length})`
      )
    )
  } else {
    core.info('Failed Insights (0)')
  }
  scanResult.details.failed_insights.forEach((insight) => {
    core.startGroup(styleText(['bold', 'red'], insight.name))
    core.info(styleText(['italic', 'redBright'], insight.description))
    core.info(styleText('red', `Severity: ${insight.severity}`))
    core.info(styleText('redBright', insight.notes))
    core.endGroup()
    insight.failure.forEach((resourceId) => {
      const { address: terraformId, name } =
        scanResult.resource_mapping[resourceId]
      core.info(
        `  • ${styleText('redBright', terraformId || `name = ${name}`)}`
      )
    })
  })
}

// most @actions toolkit packages have async methods
async function run () {
  try {
    // Workflow Inputs
    const planFileName = core.getInput('terraform-plan-file', {
      required: true
    })
    const workDir = core.getInput('working-directory', { required: true })
    const username = core.getInput('divvycloud-username', { required: true })
    const password = core.getInput('divvycloud-password', { required: true })

    // Environment variables
    const scanName =
      process.env.GITHUB_REPOSITORY +
      '.' +
      process.env.GITHUB_RUN_ID +
      '.' +
      process.env.GITHUB_RUN_NUMBER
    const author = process.env.GITHUB_ACTOR

    // Get Terraform plan
    const json = await jsonFromPlan(workDir, planFileName)

    // DivvyCloud Auth token
    const authToken = await getAuthToken(username, password).catch((error) => {
      core.error(error.message)
    })

    // Send JSON plan to DivvyCloud
    const { status, scanResult } = await getScan(
      authToken,
      author,
      scanName,
      json
    ).catch((error) => {
      core.error(error.message)
    })

    core.info(`Status Code: ${status}`)
    core.startGroup('Full Scan Results')
    core.info(JSON.stringify(scanResult, null, 2))
    core.endGroup()

    printSummary(scanResult)

    core.info('')

    switch (status) {
      case 200:
        core.info('[DivvyCloud]: Scan completed. All checks have passed!')
        break
      case 202:
        core.warning('[DivvyCloud]: Scan completed, but with warnings.')
        break
      case 406:
        core.setFailed(
          '[DivvyCloud]: Scan completed, but one or more checks failed. Please check the log for more information.'
        )
    }
  } catch (error) {
    core.setFailed(error)
  }
}

run()
