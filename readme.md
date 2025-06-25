# Auto Grade

基于`playwright`的同济大学Canvas系统自动化作业批改工具。支持自动批改简答题和文本文件上传类题目。

## Implementation

已经有某作业的所有问题的提交文件，是通过canvas的speed_grader下载得到的，各个文件的命名规则为`<学号:7位><学生ID:6位>_question_<问题编号:6位>_<提交ID:7位>_文件名`。通过文件读取各个question的问题描述文本和评分标准。将学生提交文件内容和问题文本，评分标准一同发送给LLM进行批改。LLM返回的评分和评语会被存储到本地文件中,文件名为`assignment_82752_grade.json`，为一个list，每一项为一个question的批改结果. 每一个问题的批改保存为`{"学生ID:6位":34243,"question_id": "000001", "grade": 1, "comment": "good"}`的形式。

通过canvas的speed_grader下载某个作业的所有打包文件，各个文件的命名规则为`<学号:7位><学生ID:6位>_question_<问题编号:6位>_<提交ID:7位>_文件名`。读取文件交由LLM评分，保存为JSON文件，再操作playwright自动上传到canvas的speed_grader中


重整后文件目录

```
src
    services
        file_parser/ # 读取文件，解析文件名，获取问题描述,评分标准,提交内容
        broswer/     # playwright浏览器操作，自动化填写评分到canvas的speed_grader
        grader/      # LLM批改，构造上下文，获取评分和评语
        storages/    # 存储读取批改结果，保存为json文件
    utils
        logger
        tools
    types
        index.ts # 定义数据类型
    config.ts # 配置文件，包含LLM的API密钥，playwright的浏览器配置
    process.ts # 处理文件的主函数，读取文件，解析文件名，获取问题描述,评分标准,提交内容，交给LLM批改，保存为json文件
    main.ts # 主函数，调用process.ts中的函数，自动化填写评分到canvas的speed_grader
test
    test.ts # 测试文件，测试各个模块的功能，是否正常工作
    test.sh # 测试脚本，测试各个模块的功能，是否正常工作
```

## Batch Inference

folder: `results/batch_<assignmentID>`
file_name: `input_file.jsonl`,`input_file_id.txt`, `batch_id.txt`, `output_file.jsonl`, `error_file.jsonl`

## Usage

1. 从canvas构建question文件，在目录`./questions`下，文件名为作业ID，
2. 从canvas下载作业的所有打包文件，解压并合入通过邮件提交的文件
3. 修改`.env`文件中的`ASSIGNMENT_ID`和`DOWNLOAD_PATH`
4. 运行`npm run start`，会自动批改所有问题并保存为JSON文件
