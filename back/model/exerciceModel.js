const pool = require('../config/database');

const exerciceModel = {
    async findAll() {
        const query = 'SELECT * FROM "EXERCISE" ORDER BY "id" DESC';
        const result = await pool.query(query);

        const exercises = [];
        for (const row of result.rows) {
            const fullExercise = await this.findById(row.id);
            exercises.push(fullExercise);
        }
        return exercises;
    },

    async findById(id) {
        const query = 'SELECT * FROM "EXERCISE" WHERE "id" = $1';
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) return null;

        const exercise = result.rows[0];

        if (exercise.type === 'qcm') {
            const optionsQuery = `
                SELECT * FROM "QCM_OPTION"
                WHERE "exerciseId" = $1
                ORDER BY "id"
            `;
            const optionsResult = await pool.query(optionsQuery, [id]);
            exercise.options = optionsResult.rows;

            const answerQuery = `
                SELECT "correctOptionIndex"
                FROM "QCM_ANSWER"
                WHERE "exerciseId" = $1
            `;
            const answerResult = await pool.query(answerQuery, [id]);
            exercise.correctOptionIndex =
                answerResult.rows[0]?.correctOptionIndex;
        }

        if (exercise.type === 'quiz') {
            const answerQuery = `
                SELECT "answer"
                FROM "QUIZ_ANSWER"
                WHERE "exerciseId" = $1
            `;
            const answerResult = await pool.query(answerQuery, [id]);
            exercise.answer = answerResult.rows[0]?.answer;
        }

        if (exercise.type === 'code') {
            const testsQuery = `
                SELECT * FROM "CODE_TEST"
                WHERE "exerciseId" = $1
                ORDER BY "id"
            `;
            const testsResult = await pool.query(testsQuery, [id]);
            exercise.tests = testsResult.rows;
        }

        return exercise;
    },

    async findByTeacher(idEnseignant) {
        const query = `
            SELECT * FROM "EXERCISE"
            WHERE "idEnseignant" = $1
            ORDER BY "id" DESC
        `;
        const result = await pool.query(query, [idEnseignant]);

        const exercises = [];
        for (const row of result.rows) {
            exercises.push(await this.findById(row.id));
        }
        return exercises;
    },

    async create(exerciceData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                title,
                type,
                statement,
                idEnseignant,
                idCours,
                options,
                correctOptionIndex,
                answer,
                tests
            } = exerciceData;

            const insertExerciseQuery = `
                INSERT INTO "EXERCISE"
                ("title", "type", "statement", "idEnseignant", "idCours")
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            const { rows } = await client.query(insertExerciseQuery, [
                title,
                type,
                statement,
                idEnseignant,
                idCours ?? null
            ]);

            const newExercise = rows[0];

            if (type === 'qcm') {
                for (const option of options ?? []) {
                    await client.query(
                        `INSERT INTO "QCM_OPTION" ("exerciseId", "optionText")
                         VALUES ($1, $2)`,
                        [newExercise.id, option.optionText ?? option]
                    );
                }

                if (correctOptionIndex !== undefined) {
                    await client.query(
                        `INSERT INTO "QCM_ANSWER"
                         ("exerciseId", "correctOptionIndex")
                         VALUES ($1, $2)`,
                        [newExercise.id, correctOptionIndex]
                    );
                }
            }

            if (type === 'quiz' && answer) {
                await client.query(
                    `INSERT INTO "QUIZ_ANSWER" ("exerciseId", "answer")
                     VALUES ($1, $2)`,
                    [newExercise.id, answer]
                );
            }

            if (type === 'code') {
                for (const test of tests ?? []) {
                    await client.query(
                        `INSERT INTO "CODE_TEST"
                         ("exerciseId", "input", "expectedOutput")
                         VALUES ($1, $2, $3)`,
                        [newExercise.id, test.input, test.expectedOutput]
                    );
                }
            }

            await client.query('COMMIT');
            return await this.findById(newExercise.id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async update(id, exerciceData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { title, type, statement, idCours, options, correctOptionIndex, answer, tests } =
                exerciceData;

            await client.query(
                `
                UPDATE "EXERCISE"
                SET "title" = $1,
                    "type" = $2,
                    "statement" = $3,
                    "idCours" = $4
                WHERE "id" = $5
                `,
                [title, type, statement, idCours ?? null, id]
            );

            await client.query(`DELETE FROM "QCM_OPTION" WHERE "exerciseId" = $1`, [id]);
            await client.query(`DELETE FROM "QCM_ANSWER" WHERE "exerciseId" = $1`, [id]);
            await client.query(`DELETE FROM "QUIZ_ANSWER" WHERE "exerciseId" = $1`, [id]);
            await client.query(`DELETE FROM "CODE_TEST" WHERE "exerciseId" = $1`, [id]);

            if (type === 'qcm') {
                for (const option of options ?? []) {
                    await client.query(
                        `INSERT INTO "QCM_OPTION" ("exerciseId", "optionText")
                         VALUES ($1, $2)`,
                        [id, option.optionText ?? option]
                    );
                }

                if (correctOptionIndex !== undefined) {
                    await client.query(
                        `INSERT INTO "QCM_ANSWER"
                         ("exerciseId", "correctOptionIndex")
                         VALUES ($1, $2)`,
                        [id, correctOptionIndex]
                    );
                }
            }

            if (type === 'quiz' && answer) {
                await client.query(
                    `INSERT INTO "QUIZ_ANSWER" ("exerciseId", "answer")
                     VALUES ($1, $2)`,
                    [id, answer]
                );
            }

            if (type === 'code') {
                for (const test of tests ?? []) {
                    await client.query(
                        `INSERT INTO "CODE_TEST"
                         ("exerciseId", "input", "expectedOutput")
                         VALUES ($1, $2, $3)`,
                        [id, test.input, test.expectedOutput]
                    );
                }
            }

            await client.query('COMMIT');
            return await this.findById(id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async delete(id) {
        await pool.query('DELETE FROM "EXERCISE" WHERE "id" = $1', [id]);
    },

    async enrollStudent(idUser, idExercice) {
        const query = `
            INSERT INTO "ETUDIANT_EXERCICE" ("idUser", "idExercice")
            VALUES ($1, $2)
            ON CONFLICT ("idUser", "idExercice") DO NOTHING
            RETURNING *
        `;
        const result = await pool.query(query, [idUser, idExercice]);
        return result.rows[0];
    },

    async isEnrolled(idUser, idExercice) {
        const result = await pool.query(
            `SELECT 1 FROM "ETUDIANT_EXERCICE"
             WHERE "idUser" = $1 AND "idExercice" = $2`,
            [idUser, idExercice]
        );
        return result.rowCount > 0;
    },

    async getEnrolledExercises(idUser) {
        const query = `
            SELECT e.*
            FROM "EXERCISE" e
            JOIN "ETUDIANT_EXERCICE" ee
              ON e."id" = ee."idExercice"
            WHERE ee."idUser" = $1
            ORDER BY e."id" DESC
        `;
        const result = await pool.query(query, [idUser]);

        const exercises = [];
        for (const row of result.rows) {
            exercises.push(await this.findById(row.id));
        }
        return exercises;
    }
};

module.exports = exerciceModel;
