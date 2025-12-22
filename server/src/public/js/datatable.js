$(document).ready(function () {
    let table = new DataTable('#myTable', {
        order: [[3, 'desc']],
        info: false,
        processing: true,
        colReorder: true,
        fixedColumns: {
            start: 1, // 左側固定 1 欄
            end: 2    // 右側固定 2 欄
        },
        scrollCollapse: true,
        language: {
            processing: "處理中...",
            search: "搜尋:",
            lengthMenu: "_MENU_",
            paginate: {
                first: "第一頁",
                last: "最後一頁",
                next: "下一頁",
                previous: "上一頁"
            },
            emptyTable: "目前沒有資料",
            zeroRecords: "沒有符合的資料"
        },
        initComplete: function () {
            $('#loadingOverlay').fadeOut(300);
            $('#skeletonScreen').fadeOut(300, function () {
                $('#myTable').fadeIn(300);
            });
        }
    });

    table.on('order.dt search.dt', function () {
        table.column(0, { search: 'applied', order: 'applied' }).nodes().each(function (cell, i) {
            cell.innerHTML = i + 1;
        });
    }).draw();
});

// 多條件搜尋（DataTables 2.x 寫法）
function multiSearch() {
    let table = DataTable.instances[0]; // 取得第一個 DataTable 實例

    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex) {
            var name = data[0].toLowerCase();
            var searchTerms = searchitem1.value.toLowerCase().split('+');
            for (let subTerm of searchTerms) {
                if (name.includes(subTerm.trim())) {
                    return true;
                }
            }
            return false;
        }
    );

    table.draw();
}

//即時查詢總人數
const firstSpan = document.querySelector('.sitestatesJs');
//取得字串
const text = firstSpan.textContent;
//取得數字
const Real_Time_Number = text.substring(text.length - 5);


//今日訪客
const spans = document.querySelectorAll(".sitestatesJs");
const secondSpan = spans[1];
const secondSpan_txt = secondSpan.textContent;
const secondSpan_result = secondSpan_txt.substring(text.length - 6);

//線上人數
const online = document.querySelectorAll(".sitestatesJs");
const onlineSpan = online[2];
const onlineSpan_txt = onlineSpan.textContent;
const onlineSpan_result = onlineSpan_txt.substring(text.length - 4);



let searchitem1 = document.getElementById("searchitem1");


function multiSearch() {

    $(document).ready(function () {
        var table = $('#myTable').DataTable(); // 確保這裡的表格ID為'myTable'

        $.fn.dataTable.ext.search.push(
            function (settings, data, dataIndex) {
                var name = data[0].toLowerCase();
                var searchTerms = searchitem1.value.toLowerCase().split('+'); // 使用單一搜尋框，分隔符號為'+'

                // 檢查是否有任何子搜尋詞符合
                for (let subTerm of searchTerms) {
                    if (name.includes(subTerm.trim())) {
                        return true;
                    }
                }
                return false;
            }
        );

        table.draw();
    });

}
