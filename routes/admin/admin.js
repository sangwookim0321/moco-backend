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

	const query = 'INSERT INTO psych_tests.Tests (name, description) VALUES ($1, $2) RETURNING *'
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

router.post('/addQuestion', async (req, res) => {
	const { testId, contents } = req.body

	if (!testId || !contents || !Array.isArray(contents) || contents.length === 0) {
		return res.status(400).json({
			status: 'error',
			message: '필수 항목을 모두 입력해주세요.',
		})
	}

	try {
		// 각 질문에 대해 데이터베이스에 삽입
		for (const content of contents) {
			const query = 'INSERT INTO psych_tests.Questions (test_id, content) VALUES ($1, $2)'
			const values = [testId, content]
			await db.query(query, values)
		}

		res.status(201).json({
			status: 'success',
			message: '질문이 성공적으로 추가되었습니다.',
		})
	} catch (err) {
		console.error('/addQuestion Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '질문 추가 중 서버 오류가 발생했습니다.',
		})
	}
})

module.exports = router
