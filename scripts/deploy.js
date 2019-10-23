import { readFileSync, existsSync, unlinkSync } from "fs";
import { exec } from "child_process";
import rmdir from "rimraf";
import ncp from "ncp";
import tar from "tar";
import request from "request";
import ora from "ora";

if (!existsSync(".ret.credentials")) {
  console.log("Not logged in, so cannot deploy. To log in, run npm run login.");
  process.exit(0);
}

const { host, token } = JSON.parse(readFileSync(".ret.credentials"));
const spinner = ora(`Deploying to ${host}.`).start();
const step = ora({ indent: 2 }).start();

const getTs = (() => {
  const p = n => (n < 10 ? `0${n}` : n);
  return () => {
    const d = new Date();
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(
      d.getSeconds()
    )}`;
  };
})();

(async () => {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const res = await fetch(`https://${host}/api/ita/configs/hubs`, { headers });
  const hubsConfigs = await res.json();
  const buildEnv = {};
  for (const [k, v] of Object.entries(hubsConfigs.general)) {
    buildEnv[k.toUpperCase()] = v;
  }

  buildEnv.BUILD_VERSION = `1.0.0.${getTs()}`;
  const env = Object.assign(process.env, buildEnv);

  for (const d in ["./dist", "./admin/dist"]) {
    rmdir(d, err => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  }

  step.text = "Building Client.";

  await new Promise((resolve, reject) => {
    exec("npm ci", {}, err => {
      if (err) reject(err);
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    exec("npm run build", { env }, err => {
      if (err) reject(err);
      resolve();
    });
  });

  step.text = "Building Admin Console.";

  await new Promise((resolve, reject) => {
    exec("npm ci", { cwd: "./admin" }, err => {
      if (err) reject(err);
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    exec("npm run build", { cwd: "./admin", env }, err => {
      if (err) reject(err);
      resolve();
    });
  });

  await new Promise(res => {
    ncp("./admin/dist", "./dist", err => {
      if (err) {
        console.error(err);
        process.exit(1);
      }

      res();
    });
  });
  step.text = "Packaging Build.";
  const uploadRes = await fetch(`https://${host}/api/ita/deploy/hubs/upload_url`, { headers });
  const { url, version } = await uploadRes.json();
  await tar.c({ gzip: true, C: "dist", file: "_build.tar.gz" }, ["."]);
  step.text = `Uploading Build ${buildEnv.BUILD_VERSION}.`;
  const req = request({ url, method: "put", body: readFileSync("_build.tar.gz") }); // Tried and failed to get this to use a stream :P
  unlinkSync("_build.tar.gz");
  await new Promise(res => req.on("end", res));
  step.text = "Build uploaded, deploying.";
  await fetch(`https://${host}/api/ita/deploy/hubs`, { headers, method: "POST", body: { version } });
  step.text = "Deploy finished.";
  step.stop();
  spinner.text = `Deployed to ${host}`;
  spinner.succeed();
  process.exit(0);
})();