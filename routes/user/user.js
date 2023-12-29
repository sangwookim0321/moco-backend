const OpenAI = require('openai')
const express = require('express')
const router = express.Router()
const supabase = require('../../models/db.js')
const fs = require('fs')

const openai = new OpenAI(process.env.OPENAI_API_KEY)

async function updateTotalCount(testId) {
	try {
		// result 테이블에서 count의 총합 계산
		const { data: countData, error: countError } = await supabase.from('result').select('count').eq('test_id', testId)

		if (countError) throw countError

		const totalCount = countData.reduce((acc, row) => acc + row.count, 0)

		// tests 테이블의 totalCount 업데이트
		const { error: updateError } = await supabase.from('tests').update({ totalCount: totalCount }).eq('id', testId)

		if (updateError) throw updateError

		return 'Total count updated successfully'
	} catch (error) {
		console.error('Error updating total count:', error)
		throw error
	}
}

const groupQuestionsBySetId = (questions) => {
	const questionSets = {}
	questions.forEach((question) => {
		if (!questionSets[question.set_id]) {
			questionSets[question.set_id] = []
		}
		questionSets[question.set_id].push(question)
	})
	return Object.values(questionSets)
}

router.get('/tests', async (req, res) => {
	//  ------------------------- 사용자 테스트 목록 가져오기 -------------------------
	const search = req.query.search || ''
	const page = parseInt(req.query.page) || 1
	const limit = parseInt(req.query.limit) || 10
	const offset = (page - 1) * limit
	const sort = req.query.sort || ''

	try {
		// Supabase를 사용하여 테스트 목록 페이징하여 조회
		let query = supabase.from('tests').select('*', { count: 'exact' })

		if (search) {
			query = query.ilike('name', `%${search}%`)
		}

		// 정렬 적용
		switch (sort) {
			case 'NEWEST':
				query = query.order('created_at', { ascending: false })
				break
			case 'OLDEST':
				query = query.order('created_at', { ascending: true })
				break
			case 'MOST_POPULAR':
				query = query.order('totalCount', { ascending: false })
				break
			case 'LEAST_POPULAR':
				query = query.order('totalCount', { ascending: true })
				break
			default:
				query = query.order('id', { ascending: true })
		}

		const { data, error, count } = await query.range(offset, offset + limit - 1)

		if (error) {
			throw error
		}

		res.status(200).json({
			status: 'success',
			message: '테스트 목록을 성공적으로 가져왔습니다.',
			result: data,
			page: page,
			limit: limit,
			total: count,
		})
	} catch (err) {
		res.status(500).json({
			status: 'error',
			message: '테스트 목록 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.get('/tests/:testId', async (req, res) => {
	// ---------------------------- 테스트 상세 조회 ----------------------------
	if (!req.params.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	try {
		const testId = req.params.testId

		// tests 테이블에서 특정 테스트 조회
		const { data: testData, error: testError } = await supabase.from('tests').select('*').eq('id', testId)

		if (testError) throw { stage: 'tests', error: testError }

		// types 테이블에서 해당 테스트에 연관된 데이터 조회
		const { data: typesData, error: typesError } = await supabase.from('types').select('*').eq('test_id', testId)

		if (typesError) throw { stage: 'types', error: typesError }

		// questions 테이블에서 해당 테스트에 연관된 데이터 조회
		const { data: questionsData, error: questionsError } = await supabase.from('questions').select('*').eq('test_id', testId)

		if (questionsError) throw { stage: 'questions', error: questionsError }

		const groupedQuestions = groupQuestionsBySetId(questionsData)

		res.status(200).json({
			status: 'success',
			message: '테스트 상세 조회를 성공적으로 가져왔습니다.',
			result: {
				test: testData,
				types: typesData,
				questions: groupedQuestions,
			},
		})
	} catch (err) {
		console.error('/getTests/:testId Error : ', err)

		let errorMessage = '테스트 상세 조회 중 서버 오류가 발생했습니다.'

		if (err.stage === 'tests') {
			errorMessage = '테스트 정보를 가져오는 중 서버 오류가 발생했습니다.'
		} else if (err.stage === 'types') {
			errorMessage = '테스트 타입 정보를 가져오는 중 서버 오류가 발생했습니다.'
		} else if (err.stage === 'questions') {
			errorMessage = '테스트 질문 정보를 가져오는 중 서버 오류가 발생했습니다.'
		}
		res.status(500).json({
			status: 'error',
			message: errorMessage,
		})
	}
})

router.post('/testResult/:testId', async (req, res) => {
	// ---------------------------- 테스트 결과 조회 ----------------------------
	if (!req.params.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	if (!req.body.types || !Array.isArray(req.body.types)) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 타입들을 제공해주세요.',
		})
	}

	try {
		const testId = req.params.testId
		const types = req.body.types

		// 각 타입의 출현 횟수 계산
		const frequencyMap = types.reduce((acc, val) => {
			acc[val] = (acc[val] || 0) + 1
			return acc
		}, {})

		// 가장 높은 출현 횟수 찾기
		const maxCount = Math.max(...Object.values(frequencyMap))

		// 가장 높은 출현 횟수를 가진 타입들 찾기
		const mostFrequent = Object.keys(frequencyMap).filter((key) => frequencyMap[key] === maxCount)

		console.log(mostFrequent)

		// 가장 많이 출현한 타입에 해당하는 데이터 조회
		const datas = await Promise.all(
			mostFrequent.map(async (type) => {
				const { data, error } = await supabase.from('types').select('*').eq('type', type).eq('test_id', testId)
				if (error) throw error
				return data
			})
		)

		res.status(200).json({
			status: 'success',
			message: '테스트 결과 조회를 성공적으로 가져왔습니다.',
			result: datas.flat(),
		})
	} catch (err) {
		console.error('/getTestResult/:testId Error : ', err)

		res.status(500).json({
			status: 'error',
			message: '테스트 결과 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/saveResult', async (req, res) => {
	// ---------------------------- 테스트 결과 저장 ----------------------------

	if (!req.body.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	if (!req.body.type || !req.body.description) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 결과를 제공해주세요.',
		})
	}

	try {
		const { testId, types, descriptions } = req.body

		// 테스트 결과 저장을 위한 추가 정보 조회
		const { data: testData, error: testError } = await supabase.from('tests').select('name').eq('id', testId).single()

		if (testError) throw { stage: 'tests', error: testError }

		// types와 descriptions 배열의 각 요소를 순차적으로 삽입
		for (let i = 0; i < types.length; i++) {
			const type = types[i]
			const description = descriptions[i]

			// 기존 데이터 확인
			const { data: existingData, error: existingError } = await supabase.from('result').select('id, count').eq('test_id', testId).eq('type', type).eq('description', description).single()

			if (existingError && existingError.message !== 'No rows found') throw existingError

			if (existingData) {
				// 기존 데이터가 있는 경우, count 업데이트
				const { error: updateError } = await supabase
					.from('result')
					.update({ count: existingData.count + 1 })
					.eq('id', existingData.id)

				if (updateError) throw updateError
			} else {
				// 새로운 데이터 삽입
				const { error: insertError } = await supabase.from('result').insert({
					test_id: testId,
					name: testData.name,
					type: type,
					description: description,
					count: 1,
				})

				if (insertError) throw insertError
			}
		}

		await updateTotalCount(testId)

		res.status(200).json({
			status: 'success',
			message: '테스트 결과가 성공적으로 저장되었습니다.',
		})
	} catch (err) {
		console.error('/saveResult Error : ', err)

		let errorMessage = '테스트 결과 저장 중 서버 오류가 발생했습니다.'

		if (err.stage === 'tests') {
			errorMessage = '테스트 정보를 가져오는 중 서버 오류가 발생했습니다.'
		} else if (err.stage === 'result') {
			errorMessage = '테스트 결과를 저장하는 중 서버 오류가 발생했습니다.'
		}

		res.status(500).json({
			status: 'error',
			message: errorMessage,
		})
	}
})

router.get('/statistics', async (req, res) => {
	// ---------------------------- 테스트 통계 조회 ----------------------------

	if (!req.query.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	try {
		const testId = req.query.testId

		const { data: resultData, error: resultError } = await supabase.from('result').select('*').eq('test_id', testId)

		if (resultError) throw resultError

		res.status(200).json({
			status: 'success',
			message: '테스트 통계 조회를 성공적으로 가져왔습니다.',
			result: resultData,
		})
	} catch (err) {
		console.error('/user/statistics Error : ', err)

		res.status(500).json({
			status: 'error',
			message: '테스트 통계 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/aiChat', async (req, res) => {
	// ---------------------------- GPT Assistant 호출 및 스레드 생성 ----------------------------
	const { name, assistantId, myMessage } = req.body

	if (!assistantId) {
		return res.status(400).json({
			status: 'error',
			message: 'Assistant Id 를 제공해주세요.',
		})
	}

	if (!myMessage) {
		return res.status(400).json({
			status: 'error',
			message: '메시지를 입력해주세요.',
		})
	}
	// thread_bvXgeWBJrakc9DIaXE311Cvl
	try {
		const { data: resultData, error } = await supabase.from('chatmodel').select('*').eq('assistant_id', assistantId)

		if (error) throw error

		const message = await gptAssistant(resultData, myMessage)

		res.status(200).json({
			status: 'success',
			message: 'GPT Assistant 호출을 성공적으로 가져왔습니다.',
			result: message,
		})
	} catch (err) {
		console.error('/user/aiChat Error : ', err)

		res.status(500).json({
			status: 'error',
			message: 'GPT Assistant 호출 중 서버 오류가 발생했습니다.',
		})
	}
})

router.delete('/aiChat', async (req, res) => {
	// ---------------------------- GPT Assistant 삭제 ----------------------------
	const { threadId } = req.body

	if (!threadId) {
		return res.status(400).json({
			status: 'error',
			message: 'threadId를 제공해주세요.',
		})
	}

	try {
		const response = await openai.beta.threads.del(threadId)

		res.status(200).json({
			status: 'success',
			message: '해당 GPT Assistant thread 를 삭제했습니다.',
			result: response,
		})
	} catch (err) {
		console.error('/user/aiChat Error : ', err)

		res.status(500).json({
			status: 'error',
			message: 'GPT Assistant 삭제 중 서버 오류가 발생했습니다.',
		})
	}
})

async function gptAssistant(data, myMessage) {
	if (!data || data.length === 0 || !data[0].name || !data[0].assistant_id) {
		console.error('Error: Name not found in data')
		throw new Error('Name not found in data')
	}

	const { name, prompt, assistant_id } = data[0]

	// let pdfFile

	// try {
	// 	pdfFile = await openai.files.create({
	// 		file: fs.createReadStream(`./pdf/${name}.pdf`),
	// 		purpose: 'assistants',
	// 	})
	// } catch (error) {
	// 	console.error('Error creating file in OpenAI:', error.message)
	// 	throw new Error('Error creating file in OpenAI')
	// }

	// const assistant = await openai.beta.assistants.create({
	// 	name: name,
	// 	instructions: prompt,
	// 	tools: [{ type: 'retrieval' }],
	// 	model: 'gpt-4-1106-preview',
	// 	file_ids: [pdfFile.id],
	// })

	const thread = await openai.beta.threads.create()

	await openai.beta.threads.messages.create(thread.id, {
		role: 'user',
		content: myMessage,
	})

	const run = await openai.beta.threads.runs.create(thread.id, {
		assistant_id: assistant_id,
		instructions: prompt,
	})

	// 작업 완료 여부를 체크하는 함수
	async function checkRunStatus(threadId, runId) {
		for (let i = 0; i < 10; i++) {
			// 최대 10번 시도
			const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId)

			if (runStatus.status === 'completed') {
				let messages = await openai.beta.threads.messages.list(threadId)
				return messages.data.map((msg) => ({
					role: msg.role,
					content: msg.content[0].text.value,
					threadId: threadId,
				}))
			}

			// 1초 간격으로 재시도
			await new Promise((resolve) => setTimeout(resolve, 1000))
		}
		throw new Error('Run did not complete in time.')
	}

	return await checkRunStatus(thread.id, run.id)
}

module.exports = router
