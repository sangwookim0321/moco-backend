const express = require("express");
const router = express.Router();
const db = require("../../models/db.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function checkAdminPermission(req, res) {
  // ---------------------------- 인증 함수 ----------------------------
  const token = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(token, process.env.SECRET_KEY);
  const userId = decoded.userId;

  // 데이터베이스에서 사용자의 역할을 확인
  const user = await db.query("SELECT role FROM auth.accounts WHERE id = $1", [
    userId,
  ]);

  // 사용자 역할이 1 또는 2인 경우에만 진행
  if (user.rows[0].role !== 1 && user.rows[0].role !== 2) {
    return res.status(403).json({
      status: "error",
      message: "권한이 없습니다.",
    });
  }
}

router.post("/createAdmin", async (req, res) => {
  // ---------------------------- 관리자 생성 ----------------------------
  const token = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(token, process.env.SECRET_KEY);
  const userId = decoded.userId;

  const user = await db.query("SELECT role FROM auth.accounts WHERE id = $1", [
    userId,
  ]);

  if (user.rows[0].role !== 1) {
    return res.status(403).json({
      status: "error",
      message: "권한이 없습니다.",
    });
  }

  const { username, phone, email, password } = req.body;
  const fixedPhone = phone.replace(/[-\s]/g, "");
  const fixedEmail = email.replace(/\s/g, "");
  const hashedPassword = await bcrypt.hash(password, 10);

  if (!username || !fixedPhone || !fixedEmail || !password) {
    return res.status(400).json({
      status: "error",
      message: "필수 항목을 모두 입력해주세요.",
    });
  }

  try {
    const query =
      "INSERT INTO auth.accounts (username, phone, email, password, role) VALUES ($1, $2, $3, $4, 2)";
    const values = [username, fixedPhone, fixedEmail, hashedPassword];
    await db.query(query, values);
    res.status(201).json({
      status: "success",
      message: "관리자가 성공적으로 생성되었습니다.",
    });
  } catch (err) {
    console.error("/createAdmin Error : ", err);
    res.status(500).json({
      status: "error",
      message: "관리자 생성 중 서버 오류가 발생했습니다.",
    });
  }
});

router.post("/login", async (req, res) => {
  // ---------------------------- 로그인 ----------------------------
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "필수 항목을 모두 입력해주세요.",
    });
  }

  try {
    // 데이터베이스에서 사용자 정보를 조회
    const user = await db.query(
      "SELECT * FROM auth.accounts WHERE email = $1",
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
    }

    // 비밀번호 검증
    const isValid = await bcrypt.compare(password, user.rows[0].password);

    if (!isValid) {
      return res.status(401).json({ message: "인증 실패" });
    }

    // 사용자 정보에서 userId 가져오기
    const userId = user.rows[0].id;

    // 액세스 토큰 및 리프레시 토큰 생성
    const accessToken = jwt.sign({ userId }, process.env.SECRET_KEY, {
      expiresIn: "1h",
    });
    const refreshToken = jwt.sign({ userId }, process.env.REFRESH_SECRET_KEY, {
      expiresIn: "7d",
    });

    // 액세스 토큰과 리프레시 토큰 반환
    return res.status(201).json({
      status: "success",
      message: "로그인 성공",
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("/login Error : ", err);
    res.status(500).json({
      status: "error",
      message: "로그인 중 서버 오류가 발생했습니다.",
    });
  }
});

router.post("/logout", async (req, res) => {
  // ---------------------------- 로그아웃 ----------------------------
  await checkAdminPermission(req, res);

  try {
    const accessToken = jwt.sign({ userId: userId }, process.env.SECRET_KEY, {
      expiresIn: "1s", // 액세스 토큰의 유효 기간을 1초로 설정하여 즉시 만료
    });

    res.status(200).json({
      status: "success",
      message: "로그아웃 되었습니다.",
    });
  } catch (err) {
    console.error("/logout Error: ", err);
    res.status(500).json({
      status: "error",
      message: "로그아웃 중 서버 오류가 발생했습니다.",
    });
  }
});

router.post("/refreshToken", async (req, res) => {
  // ---------------------------- 리프레시 토큰 ----------------------------
  const refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({
      status: "error",
      message: "리프레시 토큰을 제공해야 합니다.",
    });
  }

  try {
    // 리프레시 토큰을 검증하고 사용자 정보를 얻습니다.
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET_KEY);
    const userId = decoded.userId;

    // 여기에서 사용자의 권한을 확인하거나 다른 추가 검증을 수행할 수 있습니다.

    // 새로운 액세스 토큰을 발급합니다.
    const accessToken = jwt.sign({ userId: userId }, process.env.SECRET_KEY, {
      expiresIn: "1h", // 액세스 토큰의 유효 기간
    });

    return res.status(201).json({
      status: "success",
      message: "토큰이 갱신되었습니다.",
      accessToken,
    });
  } catch (err) {
    console.error("/refreshToken Error: ", err);
    res
      .status(401)
      .json({ status: "error", message: "리프레시 토큰이 유효하지 않습니다." });
  }
});

router.post("/addTest", async (req, res) => {
  // ---------------------------- 테스트 생성 ----------------------------
  await checkAdminPermission(req, res);

  const { testName, testDescription } = req.body;

  if (!testName || !testDescription) {
    return res.status(400).json({
      status: "error",
      message: "필수 항목을 모두 입력해주세요.",
    });
  }

  const query =
    "INSERT INTO psych_tests.Tests (name, description, is_published) VALUES ($1, $2, false) RETURNING *";
  const values = [testName, testDescription];
  db.query(query, values)
    .then((result) => {
      res.status(201).json({
        status: "success",
        message: "테스트가 성공적으로 추가되었습니다.",
        result: result.rows[0],
      });
    })
    .catch((err) => {
      console.error("/addTest Error : ", err);
      res.status(500).json({
        status: "error",
        message: "테스트 추가 중 서버 오류가 발생했습니다.",
      });
    });
});

router.post("/addType", async (req, res) => {
  // ---------------------------- 테스트 타입 생성 ----------------------------
  await checkAdminPermission(req, res);

  const { testId, types } = req.body;

  if (
    !testId ||
    !types ||
    typeof types !== "object" ||
    Object.keys(types).length < 2
  ) {
    return res.status(400).json({
      status: "error",
      message:
        "적절한 타입 데이터를 제공해주세요. 타입은 최소 2개 이상이어야 합니다.",
    });
  }

  try {
    await db.query("BEGIN");

    for (const [type, description] of Object.entries(types)) {
      const query =
        "INSERT INTO psych_tests.types (test_id, type, description) VALUES ($1, $2, $3)";
      const values = [testId, type, description];
      await db.query(query, values);
    }

    await db.query("COMMIT");

    res.status(201).json({
      status: "success",
      message: "타입이 성공적으로 추가되었습니다.",
    });
  } catch (err) {
    await db.query("ROLLBACK");

    console.error("/addType Error : ", err);
    res.status(500).json({
      status: "error",
      message: "타입 추가 중 서버 오류가 발생했습니다.",
    });
  }
});

router.post("/addQuestion", async (req, res) => {
  // ---------------------------- 테스트 질문 생성 ----------------------------
  await checkAdminPermission(req, res);

  const { testId, questions } = req.body;

  if (
    !testId ||
    !questions ||
    !Array.isArray(questions) ||
    questions.length < 4
  ) {
    return res.status(400).json({
      status: "error",
      message: "질문은 최소 4개 이상이어야 합니다.",
    });
  }

  for (const question of questions) {
    if (
      !question.content ||
      !Array.isArray(question.types) ||
      question.types.length === 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "각 질문은 내용과 타입 목록을 가져야 합니다.",
      });
    }
  }

  try {
    // 트랜잭션 시작
    await db.query("BEGIN");

    for (const question of questions) {
      const query =
        "INSERT INTO psych_tests.questions (test_id, content, types) VALUES ($1, $2, $3)";
      const values = [testId, question.content, question.types];
      await db.query(query, values);
    }

    // 트랜잭션 커밋
    await db.query("COMMIT");

    res.status(201).json({
      status: "success",
      message: "질문이 성공적으로 추가되었습니다.",
    });
  } catch (err) {
    // 트랜잭션 롤백
    await db.query("ROLLBACK");

    console.error("/addQuestion Error : ", err);
    res.status(500).json({
      status: "error",
      message: "질문 추가 중 서버 오류가 발생했습니다.",
    });
  }
});

router.get("/getTests", async (req, res) => {
  // ---------------------------- 테스트 목록 조회 ----------------------------
  await checkAdminPermission(req, res);

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const query = "SELECT * FROM psych_tests.Tests LIMIT $1 OFFSET $2";
    const result = await db.query(query, [limit, offset]);
    res.status(200).json({
      status: "success",
      message: "테스트 목록을 성공적으로 가져왔습니다.",
      result: result.rows,
      page: page,
      limit: limit,
    });
  } catch (err) {
    console.error("/getTests Error : ", err);
    res.status(500).json({
      status: "error",
      message: "테스트 목록 조회 중 서버 오류가 발생했습니다.",
    });
  }
});

router.delete("/deleteTest", async (req, res) => {
  // ---------------------------- 테스트 삭제 ----------------------------
  await checkAdminPermission(req, res);

  const { testId } = req.body;

  if (!testId) {
    return res.status(400).json({
      status: "error",
      message: "테스트 ID를 제공해주세요.",
    });
  }

  try {
    await db.query("BEGIN");

    await db.query("DELETE FROM psych_tests.questions WHERE test_id = $1", [
      testId,
    ]);
    await db.query("DELETE FROM psych_tests.types WHERE test_id = $1", [
      testId,
    ]);

    await db.query("DELETE FROM psych_tests.Tests WHERE id = $1", [testId]);

    await db.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "테스트가 성공적으로 삭제되었습니다.",
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("/deleteTest Error : ", err);
    res.status(500).json({
      status: "error",
      mesage: "테스트 삭제 중 서버 오류가 발생했습니다.",
    });
  }
});

module.exports = router;
