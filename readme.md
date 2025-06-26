# Auto Grade

基于`playwright`的同济大学Canvas系统自动化作业批改工具。支持自动批改简答题和文本文件上传类题目。

## Quick Start

两阶段工作流：
- 基于LLM作业批改：从Canvas下载作业提交文件，使用LLM模型批改作业，生成评分JSON文件，详情见`v2`分支
- 批改结果上传：借助`playwright`将评分JSON文件中的评分和评语填写至Canvas，详情见`main`分支

## Usage

### 作业批改

从canvas系统统一导出的作业文件，设置好评分标准，交由LLM批改，生成评分JSON文件。JSON文件格式说明

```json
[
  {
    "studentId": "xxxxxx", // 学生ID，Canvas系统中人员唯一标识
    "questionId": "82734", // 作业题目ID，Canvas系统中题目唯一标识
    "grade": 9,            // 评分
    "comment": "1. age_group列未正确创建且未删除原age列，扣1分", // 批改评语，满分时可不填写
    "gradedAt": "2025/4/12 18:11:10" // 批改时间，格式为YYYY/MM/DD HH:mm:ss
  },
  ...
]
```

### 批改结果上传

使用`playwright`将评分JSON文件中的评分和评语填写至Canvas系统。

### 环境变量说明

```env
# .env.example
# Canvas Authentication (Tongji University Unified Identity System)
STUID="xxxx"
PASSWORD="xxxx"

# Course and Assignment
COURSE_ID=xxx
ASSIGNMENT_ID=xxx
ASSIGNMENT_TYPE=single  # single or group
BINARY_SCORE=false      # true for binary score (complete/incomplete), false for numerical score
```

`ASSIGNMENT_TYPE`指示作业类型，每个作业包含的题目数量，single表示只有1个题目，group表示多个题目。`BINARY_SCORE`指示评分方式，true表示二元评分（完成/未完成），false表示数值评分。


1. 使用同济大学统一身份认证系统登陆，请在`.env`文件中补充学号及登陆密码
2. 当前版本仅支持一次批改一个作业，多个作业可修改`assignmentID`多次运行
3. 评分标准文件支持`{maxPoints}`替换
4. 上传文件型作业仅支持可预览的文本文件，如`.txt`、`.md`、代码文件等，文件会下载至`downloads`文件夹

## Acknowledgement

- [playwright](https://playwright.dev/)
- [copilot](https://copilot.github.com/)
