/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const protobuf = require('protobufjs');
const { dir } = require('tmp-promise');

const { FileWriter } = require('@accordproject/concerto-util');
const ProtobufVisitor = require('../../lib/codegen/fromcto/protobuf/protobufvisitor.js');

const {
    CASES,
    getSkipReason,
    createModelManager,
    applyVerificationEnv,
} = require('./cases.js');

const GOOGLE_PROTO_ROOT = path.dirname(require.resolve('protobufjs/package.json'));

/**
 * Generate Proto3 files from a model and verify they parse with protobufjs.
 * @param {ModelManager} modelManager populated model manager
 * @param {object} [visitorOptions] options passed to ProtobufVisitor
 */
async function verifyProtobufParses(modelManager, visitorOptions = {}) {
    const { path: outputDir, cleanup } = await dir({ unsafeCleanup: true });

    try {
        modelManager.accept(new ProtobufVisitor(), {
            fileWriter: new FileWriter(outputDir),
            ...visitorOptions,
        });

        const protoFiles = fs.readdirSync(outputDir).filter((file) => file.endsWith('.proto'));
        const root = new protobuf.Root();

        root.resolvePath = (origin, target) => {
            if (target.startsWith('google/protobuf/')) {
                return path.join(GOOGLE_PROTO_ROOT, target);
            }
            return path.join(outputDir, path.basename(target));
        };

        for (const file of protoFiles) {
            const source = fs.readFileSync(path.join(outputDir, file), 'utf-8');
            if (process.env.DUMP_GENERATED_OUTPUT) {
                // eslint-disable-next-line no-console
                console.log(`\n--- ${file} ---\n${source}`);
            }
            try {
                protobuf.parse(source, root, file);
            } catch (err) {
                throw new Error(`${file}: ${err.message}`);
            }
        }
    } finally {
        await cleanup();
    }
}

describe('verification', function () {
    this.timeout(60000);

    before(function () {
        applyVerificationEnv();
    });

    CASES.forEach(function (testCase) {
        const skipReason = getSkipReason(testCase, 'protobuf');
        const title = skipReason
            ? `generated Proto3 from ${testCase.name} parses with protobufjs (pending: ${skipReason})`
            : `generated Proto3 from ${testCase.name} parses with protobufjs`;
        const run = skipReason ? it.skip : it;

        run(title, async function () {
            const modelManager = createModelManager(testCase);
            await verifyProtobufParses(modelManager, testCase.visitorOptions || {});
        });
    });
});
