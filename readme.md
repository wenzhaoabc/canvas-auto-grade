# Auto Grade

基于`playwright`的同济大学Canvas系统自动化作业批改工具。支持自动批改简答题和文本文件上传类题目。

## Implementation

已经有某作业的所有问题的提交文件，是通过canvas的speed_grader下载得到的，各个文件的命名规则为`<学号:7位><学生ID:6位>_question_<问题编号:6位>_<提交ID:7位>_文件名`。通过文件读取各个question的问题描述文本和评分标准。将学生提交文件内容和问题文本，评分标准一同发送给LLM进行批改。LLM返回的评分和评语会被存储到本地文件中,文件名为`assignment_82752_grade.json`，为一个list，每一项为一个question的批改结果. 每一个问题的批改保存为`{"学生ID:6位":34243,"question_id": "000001", "grade": 1, "comment": "good"}`的形式。

通过canvas的speed_grader下载某个作业的所有打包文件，各个文件的命名规则为`<学号:7位><学生ID:6位>_question_<问题编号:6位>_<提交ID:7位>_文件名`。读取文件交由LLM评分，保存为JSON文件，再操作playwright自动上传到canvas的speed_grader中