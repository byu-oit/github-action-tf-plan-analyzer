const core = require('@actions/core')
const exec = require('@actions/exec')
const request = require('request-promise')

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
  await exec.exec('terraform', ['show', '-json', planFileName], options)

  // pull out any extra fluff from terraform wrapper from the hashicorp/setup-terraform action
  const json = output.match(/{.*}/)
  if (json === null) {
    core.error('null match...')
    core.debug('** start of  output **')
    core.debug(output)
    core.debug('** end of output **')
    throw Error("output didn't match with /{.*}/ correctly")
  }
  core.debug('** matched json **')
  core.debug(json[0])
  core.debug('** end matched json **')

  return json[0]
}

async function getAuth (username, password, url) {
  try {
    const response = await request({
      method: 'POST',
      uri: url,
      body: { username: username, password: password },
      json: true,
      headers: { 'Content-Type': 'application/json' }
    })
    return response.session_id || '?'
  } catch (e) {
    console.log(e)
    return '?'
  }
}

async function getScan (authToken, author, scanName, json, url) {
  try {
    const response = await request({
      method: 'POST',
      uri: url,
      body: {
        scan_name: scanName,
        author_name: author,
        scan_template: json,
        config_name: 'Test Scan',
        iac_provider: 'terraform'
      },
      json: true,
      resolveWithFullResponse: true,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Accept: 'application/json',
        'X-Auth-Token': authToken
      }
    })
    console.log(response)
    return [response.statusCode, response.body]
  } catch (e) {
    return '?'
  }
}

// most @actions toolkit packages have async methods
async function run () {
  try {
    // Workflow Inputs
    const planFileName = core.getInput('terraform-plan-file', { required: true })
    const workDir = core.getInput('working-directory', { required: true })
    const username = core.getInput('divvycloud-username', { required: true })
    const password = core.getInput('divvycloud-password', { required: true })
    const divvyUrl = core.getInput('divvycloud-URL', { required: true })

    // Enviornment variables
    const scanName = process.env.GITHUB_REPO + '.' + process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_NUMBER
    const author = process.env.ACTOR

    // Get Terraform plan
    const json = await jsonFromPlan(workDir, planFileName)

    // DivvyCloud Auth token
    const authToken = await getAuth(username, password, divvyUrl + '/v2/public/user/login')

    // Send JSON plan to Divvycloud
    const [statusCode, scanResult] = await getScan(authToken, author, scanName, json, divvyUrl + '/v3/iac/scan')

    console.log(scanResult)
    if (statusCode === 200) {
      console.log('[DivvyCloud]: Scan completed successfully.  All insights have passed.')
    } else if (statusCode === 202) {
      console.log('[DivvyCloud]: Scan completed successfully, but with warnings.  All failure-inducing insights have passed, but some warning-inducing insights did not.')
    } else if (statusCode === 406) {
      core.setFailed('[DivvyCloud]: Scan completed, but one or more insights have failed.  Please check the DivvyCloud console for more information.')
    } else {
      console.log('[DivvyCloud]: Scan failed to return correct response. Please Contact the DivvyCloud Admins')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
