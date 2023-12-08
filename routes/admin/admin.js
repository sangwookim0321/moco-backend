const express = require('express')
const router = express.Router()
const db = require('../../models/db.js')

router.post('/addTest', (req, res) => {
	const { testName, testDescription } = req.body

	if (!testName || !testDescription) {
		return res.status(400).json({
			status: 'error',
			message: '필수 항목을 모두 입력해주세요.',
		})
	}

	const query = 'INSERT INTO psych_tests.Tests (name, description, is_published) VALUES ($1, $2, false) RETURNING *'
	const values = [testName, testDescription]
	db.query(query, values)
		.then((result) => {
			res.status(201).json({
				status: 'success',
				message: '테스트가 성공적으로 추가되었습니다.',
				test: result.rows[0],
			})
		})
		.catch((err) => {
			console.error('/addTest Error : ', err)
			res.status(500).json({
				status: 'error',
				message: '테스트 추가 중 서버 오류가 발생했습니다.',
			})
		})
})

router.post('/addType', async (req, res) => {
	const { testId, types } = req.body

	if (!testId || !types || typeof types !== 'object' || Object.keys(types).length < 2) {
		return res.status(400).json({
			status: 'error',
			message: '적절한 타입 데이터를 제공해주세요. 타입은 최소 2개 이상이어야 합니다.',
		})
	}

	try {
		await db.query('BEGIN')

		for (const [type, description] of Object.entries(types)) {
			const query = 'INSERT INTO psych_tests.types (test_id, type, description) VALUES ($1, $2, $3)'
			const values = [testId, type, description]
			await db.query(query, values)
		}

		await db.query('COMMIT')

		res.status(201).json({
			status: 'success',
			message: '타입이 성공적으로 추가되었습니다.',
		})
	} catch (err) {
		await db.query('ROLLBACK')

		console.error('/addType Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '타입 추가 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/addQuestion', async (req, res) => {
	const { testId, questions } = req.body

	if (!testId || !questions || !Array.isArray(questions) || questions.length < 4) {
		return res.status(400).json({
			status: 'error',
			message: '질문은 최소 4개 이상이어야 합니다.',
		})
	}

	for (const question of questions) {
		if (!question.content || !Array.isArray(question.types) || question.types.length === 0) {
			return res.status(400).json({
				status: 'error',
				message: '각 질문은 내용과 타입 목록을 가져야 합니다.',
			})
		}
	}

	try {
		// 트랜잭션 시작
		await db.query('BEGIN')

		for (const question of questions) {
			const query = 'INSERT INTO psych_tests.questions (test_id, content, types) VALUES ($1, $2, $3)'
			const values = [testId, question.content, question.types]
			await db.query(query, values)
		}

		// 트랜잭션 커밋
		await db.query('COMMIT')

		res.status(201).json({
			status: 'success',
			message: '질문이 성공적으로 추가되었습니다.',
		})
	} catch (err) {
		// 트랜잭션 롤백
		await db.query('ROLLBACK')

		console.error('/addQuestion Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '질문 추가 중 서버 오류가 발생했습니다.',
		})
	}
})

module.exports = router
