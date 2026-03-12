package main

import (
	"fmt"
	"os"

	"xinipay/internal/license"
)

func main() {
	machineID, err := license.GetMachineID()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("=== 犀牛支付 - 机器指纹采集工具 ===")
	fmt.Println()
	fmt.Printf("Machine ID: %s\n", machineID)
	fmt.Println()
	fmt.Println("请将上方 Machine ID 发送给系统管理员以获取授权文件。")
}
